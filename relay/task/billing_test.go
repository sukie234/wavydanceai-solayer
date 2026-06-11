package task

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/songquanpeng/one-api/model"
)

func TestComputeQuota(t *testing.T) {
	bc := &model.TaskBillingContext{
		ModelRatio:  2,
		GroupRatio:  1.5,
		OtherRatios: map[string]float64{"seconds": 2, "size": 0.5},
	}
	require.Equal(t, int64(2*1.5*2*0.5*1000), ComputeQuota(bc))

	// no other ratios: plain modelRatio × groupRatio × 1000
	require.Equal(t, int64(3000), ComputeQuota(&model.TaskBillingContext{
		ModelRatio: 3, GroupRatio: 1,
	}))
}

// Failure path: the full pre-consumed amount comes back and a refund log
// (separate from consume) carries the task id.
func TestRefundTask_FullRefundWithLog(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	task := newSubmittedTask(t, user, token, 1, 300)
	require.Equal(t, int64(700), userQuota(t, user.Id), "pre-consume must debit the wallet")

	RefundTask(context.Background(), task, "upstream failed")

	require.Equal(t, int64(1000), userQuota(t, user.Id))
	var log model.Log
	require.NoError(t, model.LOG_DB.Where("type = ?", model.LogTypeRefund).First(&log).Error)
	require.Equal(t, int(300), log.Quota)
	require.Contains(t, log.Content, task.TaskId)
}

func TestRefundTask_ZeroQuotaIsNoop(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	task := newSubmittedTask(t, user, token, 1, 0)

	RefundTask(context.Background(), task, "whatever")

	require.Equal(t, int64(1000), userQuota(t, user.Id))
	require.EqualValues(t, 0, countLogs(t, model.LogTypeRefund))
}

// Success with a lower actual price: the difference is returned.
func TestSettleSuccess_AdjustDownRefundsDelta(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	task := newSubmittedTask(t, user, token, 1, 500) // wallet: 500
	actual := int64(300)
	fake := &fakeAdaptor{completeQuota: &actual}

	SettleSuccess(context.Background(), fake, task, &TaskInfo{Status: model.TaskStatusSuccess})

	require.Equal(t, int64(700), userQuota(t, user.Id), "200 over-charge must be returned")
	require.Equal(t, int64(300), reloadTask(t, task.Id).Quota, "settled quota must be persisted")
	require.EqualValues(t, 1, countLogs(t, model.LogTypeRefund))
}

// Success with a higher actual price: the difference is charged on top.
func TestSettleSuccess_AdjustUpChargesDelta(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	task := newSubmittedTask(t, user, token, 1, 500) // wallet: 500
	actual := int64(800)
	fake := &fakeAdaptor{completeQuota: &actual}

	SettleSuccess(context.Background(), fake, task, &TaskInfo{Status: model.TaskStatusSuccess})

	require.Equal(t, int64(200), userQuota(t, user.Id), "300 under-charge must be collected")
	require.Equal(t, int64(800), reloadTask(t, task.Id).Quota)
	require.EqualValues(t, 1, countLogs(t, model.LogTypeConsume))
}

// No adaptor override, but the upstream reported usage: recalculate from
// total_tokens × snapshot ratios (newSubmittedTask: modelRatio 2 × groupRatio 1).
func TestSettleSuccess_TotalTokensRecalc(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	task := newSubmittedTask(t, user, token, 1, 500) // wallet: 500
	fake := &fakeAdaptor{}

	SettleSuccess(context.Background(), fake, task, &TaskInfo{
		Status:      model.TaskStatusSuccess,
		TotalTokens: 400, // 400 × 2 × 1 = 800 quota
	})

	require.Equal(t, int64(200), userQuota(t, user.Id))
	require.Equal(t, int64(800), reloadTask(t, task.Id).Quota)
}

// Neither override nor usage data: the pre-consumed amount stands untouched.
func TestSettleSuccess_KeepsPrepaidWhenNoData(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	task := newSubmittedTask(t, user, token, 1, 500)
	fake := &fakeAdaptor{}

	SettleSuccess(context.Background(), fake, task, &TaskInfo{Status: model.TaskStatusSuccess})

	require.Equal(t, int64(500), userQuota(t, user.Id))
	require.Equal(t, int64(500), reloadTask(t, task.Id).Quota)
	require.EqualValues(t, 0, countLogs(t, model.LogTypeRefund))
	require.EqualValues(t, 0, countLogs(t, model.LogTypeConsume))
}

// Two writers racing the same terminal transition: only the CAS winner may
// refund, so the wallet is credited exactly once.
func TestFailTask_DuplicateTerminalMigrationRefundsOnce(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	task := newSubmittedTask(t, user, token, 1, 300) // wallet: 700
	ctx := context.Background()

	// both writers hold the same stale QUEUED snapshot
	failTask(ctx, task, "upstream failed", "")
	failTask(ctx, task, "task timed out", "")

	require.Equal(t, int64(1000), userQuota(t, user.Id), "refund must happen exactly once")
	require.EqualValues(t, 1, countLogs(t, model.LogTypeRefund))
	got := reloadTask(t, task.Id)
	require.Equal(t, model.TaskStatusFailure, got.Status)
	require.Equal(t, "upstream failed", got.FailReason, "the loser must not overwrite the winner's reason")
}

// The token was deleted after submission: nothing can have been credited via
// the token path, so the refund must fall back to the user wallet directly.
func TestRefundTask_TokenDeletedFallsBackToUserWallet(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	task := newSubmittedTask(t, user, token, 1, 300) // wallet: 700
	require.NoError(t, model.DB.Delete(&model.Token{}, token.Id).Error)

	RefundTask(context.Background(), task, "upstream failed")

	require.Equal(t, int64(1000), userQuota(t, user.Id), "refund must land in the wallet exactly once")
	require.EqualValues(t, 1, countLogs(t, model.LogTypeRefund))
}

// Any error other than record-not-found is ambiguous: PostConsumeTokenQuota
// credits the user before the token ledger, so the user may already have the
// money. The fallback must NOT credit again.
func TestRefundTask_AmbiguousErrorDoesNotDoubleCredit(t *testing.T) {
	setupTaskDB(t)
	user, token := newUserAndToken(t, 1000)
	task := newSubmittedTask(t, user, token, 1, 300) // wallet: 700
	// force a non-ErrRecordNotFound failure inside PostConsumeTokenQuota
	require.NoError(t, model.DB.Migrator().DropTable(&model.Token{}))

	RefundTask(context.Background(), task, "upstream failed")

	require.Equal(t, int64(700), userQuota(t, user.Id),
		"ambiguous refund errors must not trigger the wallet fallback")
	require.EqualValues(t, 0, countLogs(t, model.LogTypeRefund),
		"no refund log without a confirmed refund")
}
