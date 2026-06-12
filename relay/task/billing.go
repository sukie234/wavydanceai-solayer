package task

import (
	"context"
	"errors"
	"fmt"

	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
)

// quotaScale mirrors the image relay convention: ModelRatio holds the
// per-call price in "quota per 1K tokens" units, so ×1000 converts the
// ratio product into a quota amount.
const quotaScale = 1000

// ComputeQuota turns a billing snapshot into the quota to pre-consume:
// modelRatio × groupRatio × ∏otherRatios × 1000.
func ComputeQuota(bc *model.TaskBillingContext) int64 {
	r := bc.ModelRatio * bc.GroupRatio
	for _, v := range bc.OtherRatios {
		r *= v
	}
	return int64(r * quotaScale)
}

// RefundTask returns the full charged quota to the task owner and writes a
// refund log. The caller MUST have won the CAS for the terminal transition —
// this function itself does not guard against double refunds.
func RefundTask(ctx context.Context, task *model.Task, reason string) {
	if task.Quota <= 0 {
		return
	}
	pd, err := task.GetPrivateData()
	if err != nil {
		logger.Error(ctx, fmt.Sprintf("task %s: failed to read private data for refund: %s", task.TaskId, err.Error()))
		pd = &model.TaskPrivateData{}
	}
	err = model.PostConsumeTokenQuota(pd.Billing.TokenId, -task.Quota)
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			// Ambiguous failure: PostConsumeTokenQuota credits the user
			// wallet before the token ledger, so the user may already have
			// the money. Crediting again here would double-refund — log
			// loudly for manual reconciliation instead.
			logger.Error(ctx, fmt.Sprintf("task %s: refund of %d may be incomplete, reconcile manually: %s", task.TaskId, task.Quota, err.Error()))
			return
		}
		// The token is confirmed gone (deleted since submission), so nothing
		// was credited yet — pay the user wallet directly.
		logger.Error(ctx, fmt.Sprintf("task %s: token %d no longer exists, crediting user directly", task.TaskId, pd.Billing.TokenId))
		if err = model.IncreaseUserQuota(task.UserId, task.Quota); err != nil {
			logger.Error(ctx, fmt.Sprintf("task %s: user refund failed: %s", task.TaskId, err.Error()))
			return
		}
	}
	if err = model.CacheUpdateUserQuota(ctx, task.UserId); err != nil {
		logger.Error(ctx, "error update user quota cache: "+err.Error())
	}
	model.RecordRefundLog(ctx, &model.Log{
		UserId:    task.UserId,
		ChannelId: task.ChannelId,
		ModelName: pd.Billing.ModelName,
		TokenName: pd.Billing.TokenName,
		Quota:     int(task.Quota),
		Content:   fmt.Sprintf("任务 %s 失败退款，原因：%s", task.TaskId, reason),
	})
}

// SettleSuccess finalizes billing for a task whose SUCCESS transition the
// caller just won. Final quota priority: AdjustBillingOnComplete override >
// recalculation from upstream TotalTokens > keep the pre-consumed amount.
// A positive delta is charged on top, a negative one refunded.
func SettleSuccess(ctx context.Context, a Adaptor, task *model.Task, info *TaskInfo) {
	pd, err := task.GetPrivateData()
	if err != nil {
		logger.Error(ctx, fmt.Sprintf("task %s: failed to read private data for settlement: %s", task.TaskId, err.Error()))
		return
	}
	bc := &pd.Billing
	finalQuota := task.Quota
	if quota, ok := a.AdjustBillingOnComplete(task, info); ok {
		finalQuota = quota
	} else if info.TotalTokens > 0 {
		finalQuota = int64(float64(info.TotalTokens) * bc.ModelRatio * bc.GroupRatio)
	}
	delta := finalQuota - task.Quota
	if delta == 0 {
		return
	}
	if err = model.PostConsumeTokenQuota(bc.TokenId, delta); err != nil {
		// Settlement adjustment failed; the pre-consumed amount stands.
		logger.Error(ctx, fmt.Sprintf("task %s: settlement adjustment of %d failed: %s", task.TaskId, delta, err.Error()))
		return
	}
	if err = model.CacheUpdateUserQuota(ctx, task.UserId); err != nil {
		logger.Error(ctx, "error update user quota cache: "+err.Error())
	}
	if delta > 0 {
		model.RecordConsumeLog(ctx, &model.Log{
			UserId:    task.UserId,
			ChannelId: task.ChannelId,
			ModelName: bc.ModelName,
			TokenName: bc.TokenName,
			Quota:     int(delta),
			Content:   fmt.Sprintf("任务 %s 完成结算补扣", task.TaskId),
		})
		model.UpdateChannelUsedQuota(task.ChannelId, delta)
	} else {
		model.RecordRefundLog(ctx, &model.Log{
			UserId:    task.UserId,
			ChannelId: task.ChannelId,
			ModelName: bc.ModelName,
			TokenName: bc.TokenName,
			Quota:     int(-delta),
			Content:   fmt.Sprintf("任务 %s 完成结算退还", task.TaskId),
		})
	}
	if err = model.UpdateTaskQuota(task.Id, finalQuota); err != nil {
		logger.Error(ctx, fmt.Sprintf("task %s: failed to persist settled quota: %s", task.TaskId, err.Error()))
	}
}
