package controller

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/songquanpeng/one-api/common"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	billingratio "github.com/songquanpeng/one-api/relay/billing/ratio"
	"github.com/songquanpeng/one-api/relay/meta"
	relaytask "github.com/songquanpeng/one-api/relay/task"
)

// indirection for tests; production resolves via the relay/task registry
var (
	getTaskPlatform = relaytask.GetPlatform
	getTaskAdaptor  = relaytask.GetAdaptor
)

func videoError(c *gin.Context, statusCode int, code string, message string) {
	c.JSON(statusCode, gin.H{
		"error": gin.H{
			"message": helper.MessageWithRequestId(message, c.GetString(helper.RequestIdKey)),
			"type":    "one_api_error",
			"code":    code,
		},
	})
}

// RelayVideoSubmit handles POST /v1/videos (OpenAI Video compatible): it
// pre-consumes quota, submits the job upstream and returns immediately with
// a queued task. The polling loop settles or refunds later.
func RelayVideoSubmit(c *gin.Context) {
	ctx := c.Request.Context()
	taskMeta := meta.GetByContext(c)

	var request relaytask.SubmitRequest
	if err := common.UnmarshalBodyReusable(c, &request); err != nil {
		videoError(c, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}

	platform := getTaskPlatform(taskMeta.OriginModelName)
	adaptor := getTaskAdaptor(platform)
	if platform == "" || adaptor == nil {
		videoError(c, http.StatusBadRequest, "model_not_supported",
			fmt.Sprintf("模型 %s 不支持视频任务", taskMeta.OriginModelName))
		return
	}

	// apply channel-level model mapping
	taskMeta.ActualModelName = taskMeta.OriginModelName
	if mapped, ok := taskMeta.ModelMapping[taskMeta.OriginModelName]; ok && mapped != "" {
		taskMeta.ActualModelName = mapped
	}

	adaptor.Init(taskMeta)
	action, err := adaptor.ValidateRequest(c, taskMeta)
	if err != nil {
		videoError(c, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	otherRatios, err := adaptor.EstimateBilling(taskMeta)
	if err != nil {
		videoError(c, http.StatusBadRequest, "estimate_billing_failed", err.Error())
		return
	}

	// Snapshot the billing context now: settlement and refunds happen in the
	// poller, after prices may have changed.
	billingContext := &model.TaskBillingContext{
		TokenId:     taskMeta.TokenId,
		TokenName:   taskMeta.TokenName,
		ModelName:   taskMeta.OriginModelName,
		ModelRatio:  billingratio.GetModelRatio(taskMeta.ActualModelName, taskMeta.ChannelType),
		GroupRatio:  billingratio.GetGroupRatio(taskMeta.Group),
		OtherRatios: otherRatios,
	}
	quota := relaytask.ComputeQuota(billingContext)
	if err = model.PreConsumeTokenQuota(taskMeta.TokenId, quota); err != nil {
		videoError(c, http.StatusForbidden, "insufficient_user_quota", err.Error())
		return
	}
	// charged tracks the amount actually debited so far; every later billing
	// adjustment updates it, and failure refunds always return exactly this —
	// refunding the stale pre-consumed amount would leave a residual charge
	// (or over-refund) once AdjustBillingOnSubmit has corrected the price.
	charged := quota
	refund := func(reason string) {
		logger.Error(ctx, fmt.Sprintf("video submit failed (%s), returning charged quota %d", reason, charged))
		if err := model.PostConsumeTokenQuota(taskMeta.TokenId, -charged); err != nil {
			logger.Error(ctx, "error returning charged quota: "+err.Error())
		}
		_ = model.CacheUpdateUserQuota(ctx, taskMeta.UserId)
	}

	requestBody, err := adaptor.BuildRequestBody(c, taskMeta)
	if err != nil {
		refund("build request body: " + err.Error())
		videoError(c, http.StatusInternalServerError, "build_request_failed", err.Error())
		return
	}
	resp, err := adaptor.DoRequest(c, taskMeta, requestBody)
	if err != nil {
		refund("do request: " + err.Error())
		videoError(c, http.StatusInternalServerError, "do_request_failed", err.Error())
		return
	}
	// the handler owns the upstream body: DoResponse only reads it, so close
	// here on every path to avoid leaking the connection
	if resp != nil && resp.Body != nil {
		defer resp.Body.Close()
	}
	upstreamTaskId, respErr := adaptor.DoResponse(c, resp, taskMeta)
	if respErr != nil {
		refund("upstream rejected: " + respErr.Error.Message)
		videoError(c, respErr.StatusCode, "upstream_error", respErr.Error.Message)
		return
	}

	// correct the charge with the upstream's actually accepted parameters
	if adjusted, ok := adaptor.AdjustBillingOnSubmit(taskMeta, quota); ok && adjusted != quota {
		if err = model.PostConsumeTokenQuota(taskMeta.TokenId, adjusted-quota); err != nil {
			logger.Error(ctx, "error adjusting quota on submit: "+err.Error())
		} else {
			charged = adjusted
		}
	}
	_ = model.CacheUpdateUserQuota(ctx, taskMeta.UserId)

	task := &model.Task{
		TaskId:     model.GenerateTaskId(),
		Platform:   platform,
		UserId:     taskMeta.UserId,
		Group:      taskMeta.Group,
		ChannelId:  taskMeta.ChannelId,
		Quota:      charged,
		Action:     action,
		Status:     model.TaskStatusQueued,
		SubmitTime: helper.GetTimestamp(),
		Properties: request.PropertiesJSON(),
	}
	if err = task.SetPrivateData(&model.TaskPrivateData{
		UpstreamTaskId: upstreamTaskId,
		Billing:        *billingContext,
	}); err != nil {
		refund("marshal private data: " + err.Error())
		videoError(c, http.StatusInternalServerError, "create_task_failed", err.Error())
		return
	}
	if err = model.InsertTask(task); err != nil {
		// without the row the poller can never settle — refund and bail out
		refund("insert task: " + err.Error())
		videoError(c, http.StatusInternalServerError, "create_task_failed", err.Error())
		return
	}

	if charged != 0 {
		logContent := fmt.Sprintf("视频任务 %s，倍率：%.2f × %.2f",
			task.TaskId, billingContext.ModelRatio, billingContext.GroupRatio)
		model.RecordConsumeLog(ctx, &model.Log{
			UserId:    taskMeta.UserId,
			ChannelId: taskMeta.ChannelId,
			ModelName: taskMeta.OriginModelName,
			TokenName: taskMeta.TokenName,
			Quota:     int(charged),
			Content:   logContent,
		})
		model.UpdateUserUsedQuotaAndRequestCount(taskMeta.UserId, charged)
		model.UpdateChannelUsedQuota(taskMeta.ChannelId, charged)
	}

	c.JSON(http.StatusOK, relaytask.BuildVideoResponse(task))
}

// GetVideoTask handles GET /v1/videos/:task_id. It reads the local task row
// only — the poller keeps it fresh. Owner-scoped: other users get 404.
func GetVideoTask(c *gin.Context) {
	task, err := model.GetTaskByTaskId(c.Param("task_id"))
	if err != nil || task.UserId != c.GetInt(ctxkey.Id) {
		videoError(c, http.StatusNotFound, "task_not_found", "任务不存在")
		return
	}
	c.JSON(http.StatusOK, relaytask.BuildVideoResponse(task))
}
