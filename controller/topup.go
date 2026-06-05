package controller

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/service/payment"
	"github.com/songquanpeng/one-api/service/payment/crypto"
)

// TopupAmountOption is one purchasable amount tier we expose to the user.
type TopupAmountOption struct {
	Money    int64  `json:"money"`    // CNY cents (or USD cents — see PaymentCurrency)
	Quota    int64  `json:"quota"`
	Display  string `json:"display"`
	Discount string `json:"discount,omitempty"` // e.g. "9折"; empty if no discount
}

// CryptoAdapterInfo summarizes one enabled crypto adapter for the UI.
type CryptoAdapterInfo struct {
	Name        string   `json:"name"`
	DisplayName string   `json:"display_name"`
	Assets      []string `json:"assets"`
}

// GetTopupInfo returns the per-user topup landing data: which gateways are
// available right now, the configured amount tiers, and any redirect URL the
// frontend should use after payment.
func GetTopupInfo(c *gin.Context) {
	if !config.PaymentEnabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "payments disabled",
		})
		return
	}
	cryptos := make([]CryptoAdapterInfo, 0)
	for _, a := range crypto.EnabledList() {
		cryptos = append(cryptos, CryptoAdapterInfo{
			Name:        a.Name(),
			DisplayName: a.DisplayName(),
			Assets:      a.SupportedAssets(),
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"stripe_enabled":   config.StripeEnabled,
			"epay_enabled":     config.EpayEnabled,
			"crypto_adapters":  cryptos,
			"amount_options":   defaultAmountOptions(),
			"return_url":       config.PaymentReturnURL,
		},
	})
}

// defaultAmountOptions is a hardcoded starter tier list. P0 ships with this
// fixed shape; admin-configurable tiers can come later.
func defaultAmountOptions() []TopupAmountOption {
	tiers := []int64{10, 50, 100, 500, 1000} // RMB / USD
	out := make([]TopupAmountOption, 0, len(tiers))
	for _, money := range tiers {
		quota, err := payment.MoneyToQuota(money * 100)
		if err != nil {
			continue
		}
		out = append(out, TopupAmountOption{
			Money:   money * 100,
			Quota:   quota,
			Display: strconv.FormatInt(money, 10),
		})
	}
	return out
}

// GetUserTopups returns the calling user's own order history (most recent
// first). Pagination via ?p=N&size=M.
func GetUserTopups(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	page, size := pagination(c, 20, 100)
	offset := (page - 1) * size
	list, err := model.ListUserTopups(userId, offset, size)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    list,
	})
}

// RequestTopupAmountRequest is the body for /topup/amount — the frontend asks
// "for this money, what quota will I get?" before kicking off payment.
type RequestTopupAmountRequest struct {
	Money int64 `json:"money"` // in cents
}

// RequestTopupAmount returns the quota that would be credited if the user
// paid this money right now. Pure preview — no order is created.
func RequestTopupAmount(c *gin.Context) {
	if !config.PaymentEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "payments disabled"})
		return
	}
	var req RequestTopupAmountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, err)
		return
	}
	quota, err := payment.MoneyToQuota(req.Money)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"money": req.Money,
			"quota": quota,
		},
	})
}

// AdminListTopups serves the admin orders page. Supports ?user_id, ?status,
// ?gateway, ?start, ?end and pagination.
func AdminListTopups(c *gin.Context) {
	filter := model.TopupFilter{
		Status:  c.Query("status"),
		Gateway: c.Query("gateway"),
	}
	if v := c.Query("user_id"); v != "" {
		filter.UserId, _ = strconv.Atoi(v)
	}
	if v := c.Query("start"); v != "" {
		filter.StartAt, _ = strconv.ParseInt(v, 10, 64)
	}
	if v := c.Query("end"); v != "" {
		filter.EndAt, _ = strconv.ParseInt(v, 10, 64)
	}
	page, size := pagination(c, 20, 200)
	offset := (page - 1) * size
	list, err := model.AdminListTopups(filter, offset, size)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    list,
	})
}

// AdminCompleteTopupRequest is the body for the manual-complete endpoint.
// Admin uses this when a payment landed at the gateway but our webhook never
// fired (lost callback, wrong signature during rotation, etc.).
type AdminCompleteTopupRequest struct {
	TradeNo string `json:"trade_no" binding:"required"`
	Note    string `json:"note"`
}

// AdminCompleteTopup forces a pending order to success. Goes through the
// same CompleteTopup contract — quota credit is idempotent.
func AdminCompleteTopup(c *gin.Context) {
	var req AdminCompleteTopupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, err)
		return
	}
	operator := c.GetInt(ctxkey.Id)
	logger.SysLogf("admin %d manually completing topup %s: %s", operator, req.TradeNo, req.Note)
	if err := model.AdminMarkTopupSuccess(c.Request.Context(), req.TradeNo, req.Note); err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// ---- helpers ----

func respondError(c *gin.Context, err error) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"message": err.Error(),
	})
}

// pagination reads ?p=N&size=M with sensible defaults and a hard cap.
func pagination(c *gin.Context, defaultSize, maxSize int) (page, size int) {
	page, _ = strconv.Atoi(c.DefaultQuery("p", "1"))
	if page < 1 {
		page = 1
	}
	size, _ = strconv.Atoi(c.DefaultQuery("size", strconv.Itoa(defaultSize)))
	if size < 1 {
		size = defaultSize
	}
	if size > maxSize {
		size = maxSize
	}
	return page, size
}
