package task

import (
	"encoding/json"

	"github.com/songquanpeng/one-api/model"
	relaymodel "github.com/songquanpeng/one-api/relay/model"
)

// SubmitRequest is the OpenAI-Video-compatible body of POST /v1/videos.
// Adaptors needing upstream-specific fields can re-read the raw body via
// common.UnmarshalBodyReusable.
type SubmitRequest struct {
	Model    string            `json:"model"`
	Prompt   string            `json:"prompt"`
	Mode     string            `json:"mode,omitempty"`
	Image    string            `json:"image,omitempty"`
	Size     string            `json:"size,omitempty"`
	Seconds  string            `json:"seconds,omitempty"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// PropertiesJSON snapshots the request into Task.Properties. The image
// payload is dropped on purpose — it can be base64 and would bloat the row.
func (r *SubmitRequest) PropertiesJSON() string {
	snapshot := *r
	snapshot.Image = ""
	bytes, err := json.Marshal(&snapshot)
	if err != nil {
		return ""
	}
	return string(bytes)
}

// VideoResponse is the OpenAI-Video-compatible representation of a task.
type VideoResponse struct {
	Id          string            `json:"id"`
	Object      string            `json:"object"` // always "video"
	Model       string            `json:"model,omitempty"`
	Status      string            `json:"status"` // queued | in_progress | completed | failed
	Progress    int               `json:"progress"`
	CreatedAt   int64             `json:"created_at"`
	CompletedAt int64             `json:"completed_at,omitempty"`
	Error       *relaymodel.Error `json:"error,omitempty"`
	Metadata    map[string]string `json:"metadata,omitempty"` // "url" carries the result link
}

// ToOpenAIVideoStatus maps an internal task status onto the OpenAI Video
// status enum.
func ToOpenAIVideoStatus(status model.TaskStatus) string {
	switch status {
	case model.TaskStatusInProgress:
		return "in_progress"
	case model.TaskStatusSuccess:
		return "completed"
	case model.TaskStatusFailure:
		return "failed"
	default: // NOT_START / SUBMITTED / QUEUED
		return "queued"
	}
}

func BuildVideoResponse(task *model.Task) *VideoResponse {
	resp := &VideoResponse{
		Id:        task.TaskId,
		Object:    "video",
		Status:    ToOpenAIVideoStatus(task.Status),
		Progress:  task.Progress,
		CreatedAt: task.CreatedAt,
	}
	var props SubmitRequest
	if task.Properties != "" && json.Unmarshal([]byte(task.Properties), &props) == nil {
		resp.Model = props.Model
	}
	switch task.Status {
	case model.TaskStatusSuccess:
		resp.CompletedAt = task.FinishTime
		if task.ResultUrl != "" {
			resp.Metadata = map[string]string{"url": task.ResultUrl}
		}
	case model.TaskStatusFailure:
		resp.Error = &relaymodel.Error{
			Message: task.FailReason,
			Type:    "video_generation_error",
		}
	}
	return resp
}
