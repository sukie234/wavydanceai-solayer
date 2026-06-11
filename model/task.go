package model

import (
	"encoding/json"
	"errors"

	"github.com/songquanpeng/one-api/common/random"
)

// TaskStatus is the lifecycle state of an async relay task:
//
//	NOT_START → SUBMITTED → QUEUED → IN_PROGRESS → SUCCESS / FAILURE
//
// Any non-terminal state can also be forced to FAILURE by the timeout scan.
type TaskStatus string

const (
	TaskStatusNotStart   TaskStatus = "NOT_START"
	TaskStatusSubmitted  TaskStatus = "SUBMITTED"
	TaskStatusQueued     TaskStatus = "QUEUED"
	TaskStatusInProgress TaskStatus = "IN_PROGRESS"
	TaskStatusSuccess    TaskStatus = "SUCCESS"
	TaskStatusFailure    TaskStatus = "FAILURE"
)

func (s TaskStatus) IsTerminal() bool {
	return s == TaskStatusSuccess || s == TaskStatusFailure
}

var taskTerminalStatuses = []TaskStatus{TaskStatusSuccess, TaskStatusFailure}

// TaskBillingContext snapshots every value needed to settle or refund a task
// after the submitting HTTP request is gone. Prices and ratios can change
// between submit and completion; settlement must use this snapshot, never a
// live lookup, or refunds would be computed with the wrong price.
type TaskBillingContext struct {
	TokenId     int                `json:"token_id"`
	TokenName   string             `json:"token_name"`
	ModelName   string             `json:"model_name"`
	ModelRatio  float64            `json:"model_ratio"`
	GroupRatio  float64            `json:"group_ratio"`
	OtherRatios map[string]float64 `json:"other_ratios,omitempty"`
}

// TaskPrivateData is server-side state that must never reach the client; the
// json:"-" tag on Task.PrivateData blocks accidental serialization.
type TaskPrivateData struct {
	UpstreamTaskId string             `json:"upstream_task_id"`
	Billing        TaskBillingContext `json:"billing"`
}

type Task struct {
	Id        int64  `json:"id" gorm:"primaryKey"`
	CreatedAt int64  `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt int64  `json:"updated_at" gorm:"autoUpdateTime"`
	TaskId    string `json:"task_id" gorm:"type:varchar(50);uniqueIndex"` // public id, locally generated
	Platform  string `json:"platform" gorm:"type:varchar(30);index"`
	UserId    int    `json:"user_id" gorm:"index"`
	Group     string `json:"group" gorm:"type:varchar(32)"` // user group snapshot at submit time
	ChannelId int    `json:"channel_id"`
	// Quota is the amount currently charged for this task — the single
	// source of truth for refunds.
	Quota       int64      `json:"quota"`
	Action      string     `json:"action" gorm:"type:varchar(40)"`
	Status      TaskStatus `json:"status" gorm:"type:varchar(20);index"`
	FailReason  string     `json:"fail_reason"`
	SubmitTime  int64      `json:"submit_time" gorm:"index"`
	StartTime   int64      `json:"start_time"`
	FinishTime  int64      `json:"finish_time"`
	Progress    int        `json:"progress"` // 0-100
	ResultUrl   string     `json:"result_url"`
	Properties  string     `json:"properties" gorm:"type:json"` // request snapshot (model, prompt, ...)
	PrivateData string     `json:"-" gorm:"type:json"`          // TaskPrivateData; never sent to clients
	Data        string     `json:"data" gorm:"type:json"`       // raw upstream response
}

// GenerateTaskId returns a new public task id. The upstream's real task id is
// kept in PrivateData; clients only ever see this locally generated one.
func GenerateTaskId() string {
	return "task_" + random.GetUUID()
}

func (task *Task) GetPrivateData() (*TaskPrivateData, error) {
	data := &TaskPrivateData{}
	if task.PrivateData == "" {
		return data, nil
	}
	err := json.Unmarshal([]byte(task.PrivateData), data)
	return data, err
}

func (task *Task) SetPrivateData(data *TaskPrivateData) error {
	bytes, err := json.Marshal(data)
	if err != nil {
		return err
	}
	task.PrivateData = string(bytes)
	return nil
}

func InsertTask(task *Task) error {
	return DB.Create(task).Error
}

func GetTaskByTaskId(taskId string) (*Task, error) {
	if taskId == "" {
		return nil, errors.New("task_id 为空！")
	}
	task := &Task{}
	err := DB.Where("task_id = ?", taskId).First(task).Error
	return task, err
}

// UpdateTaskStatus atomically migrates a task out of fromStatus and reports
// whether the caller won the transition. Every status change that triggers a
// refund or settlement MUST go through this CAS — only the winner may touch
// money, which is the sole guard against double refunds when several writers
// (poller, timeout scan, future callbacks) race on the same task.
//
// Deliberately uses Model().Where().Updates() with a map: GORM's Save() falls
// back to an upsert when the WHERE clause matches zero rows, which would
// silently bypass the CAS.
func UpdateTaskStatus(id int64, fromStatus TaskStatus, updates map[string]interface{}) (bool, error) {
	result := DB.Model(&Task{}).Where("id = ? AND status = ?", id, fromStatus).Updates(updates)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

// UpdateTaskNonTerminal updates progress-style fields while the task is still
// running. The status guard ensures a slow writer can never overwrite a
// terminal state that a concurrent CAS winner already committed.
func UpdateTaskNonTerminal(id int64, updates map[string]interface{}) error {
	return DB.Model(&Task{}).
		Where("id = ? AND status NOT IN ?", id, taskTerminalStatuses).
		Updates(updates).Error
}

// UpdateTaskQuota records the final settled quota for bookkeeping after a
// completed-task settlement adjusted the charge.
func UpdateTaskQuota(id int64, quota int64) error {
	return DB.Model(&Task{}).Where("id = ?", id).Update("quota", quota).Error
}

func ListUnfinishedTasks(limit int) ([]*Task, error) {
	var tasks []*Task
	err := DB.Where("status NOT IN ?", taskTerminalStatuses).
		Order("id").Limit(limit).Find(&tasks).Error
	return tasks, err
}

// ListTimeoutTasks returns non-terminal tasks submitted before the given
// unix timestamp; the poller fails and refunds them.
func ListTimeoutTasks(limit int, submittedBefore int64) ([]*Task, error) {
	var tasks []*Task
	err := DB.Where("status NOT IN ? AND submit_time < ?", taskTerminalStatuses, submittedBefore).
		Order("id").Limit(limit).Find(&tasks).Error
	return tasks, err
}
