package auth

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/controller"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/setting/auth_setting"
)

// Google OAuth — dedicated handler so admins see "Google" in the UI and can
// run a separate generic OIDC provider in parallel. Endpoints are hardcoded;
// only ClientId / ClientSecret / Enabled are runtime-configurable, owned by
// setting/auth_setting/google_setting.go.
//
// Spec: https://developers.google.com/identity/protocols/oauth2/openid-connect

const (
	googleTokenEndpoint    = "https://oauth2.googleapis.com/token"
	googleUserinfoEndpoint = "https://openidconnect.googleapis.com/v1/userinfo"
)

type googleTokenResponse struct {
	AccessToken string `json:"access_token"`
	IDToken     string `json:"id_token"`
	ExpiresIn   int    `json:"expires_in"`
	TokenType   string `json:"token_type"`
	Scope       string `json:"scope"`
}

type googleUserInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	GivenName     string `json:"given_name"`
	FamilyName    string `json:"family_name"`
	Picture       string `json:"picture"`
	Locale        string `json:"locale"`
}

func getGoogleUserInfoByCode(code string) (*googleUserInfo, error) {
	if code == "" {
		return nil, errors.New("无效的参数")
	}
	gs := auth_setting.GetGoogleSetting()
	form := url.Values{}
	form.Set("client_id", gs.ClientId)
	form.Set("client_secret", gs.ClientSecret)
	form.Set("code", code)
	form.Set("grant_type", "authorization_code")
	form.Set("redirect_uri", fmt.Sprintf("%s/oauth/google", config.ServerAddress))

	req, err := http.NewRequest("POST", googleTokenEndpoint, bytes.NewBufferString(form.Encode()))
	if err != nil {
		return nil, err
	}
	// Google's token endpoint speaks form-encoded, not JSON.
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	client := http.Client{Timeout: 10 * time.Second}

	res, err := client.Do(req)
	if err != nil {
		logger.SysLog("google token exchange: " + err.Error())
		return nil, errors.New("无法连接 Google 验证服务器，请稍后重试")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google token exchange returned %d", res.StatusCode)
	}
	var tokenResp googleTokenResponse
	if err := json.NewDecoder(res.Body).Decode(&tokenResp); err != nil {
		return nil, err
	}
	if tokenResp.AccessToken == "" {
		return nil, errors.New("google did not return access_token")
	}

	req2, err := http.NewRequest("GET", googleUserinfoEndpoint, nil)
	if err != nil {
		return nil, err
	}
	req2.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)
	res2, err := client.Do(req2)
	if err != nil {
		logger.SysLog("google userinfo: " + err.Error())
		return nil, errors.New("无法获取 Google 用户信息，请稍后重试")
	}
	defer res2.Body.Close()
	if res2.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google userinfo returned %d", res2.StatusCode)
	}
	var gu googleUserInfo
	if err := json.NewDecoder(res2.Body).Decode(&gu); err != nil {
		return nil, err
	}
	if gu.Sub == "" {
		return nil, errors.New("google userinfo missing sub")
	}
	return &gu, nil
}

func GoogleAuth(c *gin.Context) {
	ctx := c.Request.Context()
	session := sessions.Default(c)
	state := c.Query("state")
	if state == "" || session.Get("oauth_state") == nil || state != session.Get("oauth_state").(string) {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "state is empty or not same",
		})
		return
	}
	// Already-signed-in users routed through GoogleAuth are binding Google
	// to an existing account.
	username := session.Get("username")
	if username != nil {
		GoogleBind(c)
		return
	}
	if !auth_setting.GetGoogleSetting().Enabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "管理员未开启通过 Google 登录及注册",
		})
		return
	}
	gu, err := getGoogleUserInfoByCode(c.Query("code"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	user := model.User{GoogleId: gu.Sub}
	if model.IsGoogleIdAlreadyTaken(user.GoogleId) {
		if err := user.FillUserByGoogleId(); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
	} else {
		if !config.RegisterEnabled {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "管理员关闭了新用户注册"})
			return
		}
		user.Email = gu.Email
		// Username has to be unique + non-empty. Try the email local-part first
		// (matches what humans expect), then fall back to a generated handle.
		username := generatedUsernameFromGoogle(gu)
		user.Username = username
		if gu.Name != "" {
			user.DisplayName = gu.Name
		} else {
			user.DisplayName = "Google User"
		}
		if err := user.Insert(ctx, 0); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
	}

	if user.Status != model.UserStatusEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户已被封禁"})
		return
	}
	controller.SetupLogin(&user, c)
}

// generatedUsernameFromGoogle picks a username that's unique. Order of
// preference: email local-part → given_name → "google_<id>".
func generatedUsernameFromGoogle(gu *googleUserInfo) string {
	candidates := []string{}
	if gu.Email != "" {
		for i, ch := range gu.Email {
			if ch == '@' {
				candidates = append(candidates, gu.Email[:i])
				break
			}
		}
	}
	if gu.GivenName != "" {
		candidates = append(candidates, gu.GivenName)
	}
	for _, c := range candidates {
		if c != "" && !model.IsUsernameAlreadyTaken(c) {
			return c
		}
	}
	return "google_" + strconv.Itoa(model.GetMaxUserId()+1)
}

// GoogleBind links a Google identity to a signed-in user.
func GoogleBind(c *gin.Context) {
	if !auth_setting.GetGoogleSetting().Enabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "管理员未开启通过 Google 登录及注册",
		})
		return
	}
	gu, err := getGoogleUserInfoByCode(c.Query("code"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	user := model.User{GoogleId: gu.Sub}
	if model.IsGoogleIdAlreadyTaken(user.GoogleId) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "该 Google 账户已被绑定"})
		return
	}
	session := sessions.Default(c)
	id := session.Get("id")
	if id == nil {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "未登录"})
		return
	}
	user.Id = id.(int)
	if err := user.FillUserById(); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	user.GoogleId = gu.Sub
	if err := user.Update(false); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "bind"})
}
