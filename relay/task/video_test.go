package task

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/songquanpeng/one-api/model"
)

func TestToOpenAIVideoStatus(t *testing.T) {
	cases := map[model.TaskStatus]string{
		model.TaskStatusNotStart:   "queued",
		model.TaskStatusSubmitted:  "queued",
		model.TaskStatusQueued:     "queued",
		model.TaskStatusInProgress: "in_progress",
		model.TaskStatusSuccess:    "completed",
		model.TaskStatusFailure:    "failed",
	}
	for status, want := range cases {
		require.Equal(t, want, ToOpenAIVideoStatus(status), "status %s", status)
	}
}

func TestBuildVideoResponse_Success(t *testing.T) {
	task := &model.Task{
		TaskId:     "task_abc",
		Status:     model.TaskStatusSuccess,
		Progress:   100,
		CreatedAt:  111,
		FinishTime: 222,
		ResultUrl:  "https://example.com/video.mp4",
		Properties: `{"model":"fake-video","prompt":"a cat"}`,
	}
	resp := BuildVideoResponse(task)
	require.Equal(t, "task_abc", resp.Id)
	require.Equal(t, "video", resp.Object)
	require.Equal(t, "fake-video", resp.Model)
	require.Equal(t, "completed", resp.Status)
	require.Equal(t, 100, resp.Progress)
	require.EqualValues(t, 222, resp.CompletedAt)
	require.Equal(t, "https://example.com/video.mp4", resp.Metadata["url"])
	require.Nil(t, resp.Error)
}

func TestBuildVideoResponse_Failure(t *testing.T) {
	task := &model.Task{
		TaskId:     "task_abc",
		Status:     model.TaskStatusFailure,
		FailReason: "content moderation",
	}
	resp := BuildVideoResponse(task)
	require.Equal(t, "failed", resp.Status)
	require.NotNil(t, resp.Error)
	require.Equal(t, "content moderation", resp.Error.Message)
	require.Nil(t, resp.Metadata)
}

func TestSubmitRequest_PropertiesJSONDropsImage(t *testing.T) {
	req := &SubmitRequest{
		Model:  "fake-video",
		Prompt: "a cat",
		Image:  "data:image/png;base64,AAAA",
	}
	props := req.PropertiesJSON()
	require.Contains(t, props, `"model":"fake-video"`)
	require.Contains(t, props, `"prompt":"a cat"`)
	require.NotContains(t, props, "base64", "image payloads must not be persisted")
	require.Equal(t, "data:image/png;base64,AAAA", req.Image, "the original request must not be mutated")
}
