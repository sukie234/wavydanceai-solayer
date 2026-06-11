package model

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupTaskTestDB uses a file-backed sqlite (not ":memory:") because the CAS
// test runs concurrent goroutines: each pooled connection to ":memory:" would
// get its own empty database.
func setupTaskTestDB(t *testing.T) {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "task.db") + "?_busy_timeout=5000"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Task{}))
	DB = db
	LOG_DB = db
}

func newQueuedTask(t *testing.T) *Task {
	t.Helper()
	task := &Task{
		TaskId:     GenerateTaskId(),
		Platform:   "fake",
		UserId:     1,
		Group:      "default",
		ChannelId:  1,
		Quota:      100,
		Action:     "generate",
		Status:     TaskStatusQueued,
		SubmitTime: 1000,
	}
	require.NoError(t, InsertTask(task))
	return task
}

func TestGenerateTaskId_UniqueAndPrefixed(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 1000; i++ {
		id := GenerateTaskId()
		require.True(t, strings.HasPrefix(id, "task_"))
		require.False(t, seen[id], "duplicate task id generated: %s", id)
		seen[id] = true
	}
}

// Two concurrent writers racing the same terminal transition: exactly one
// CAS must win. This is the invariant the whole billing design rests on.
func TestUpdateTaskStatus_ConcurrentCASSingleWinner(t *testing.T) {
	setupTaskTestDB(t)
	task := newQueuedTask(t)

	const N = 8
	var wins int32
	var wg sync.WaitGroup
	wg.Add(N)
	for i := 0; i < N; i++ {
		go func(i int) {
			defer wg.Done()
			target := TaskStatusSuccess
			if i%2 == 1 {
				target = TaskStatusFailure
			}
			won, err := UpdateTaskStatus(task.Id, TaskStatusQueued, map[string]interface{}{
				"status": target,
			})
			require.NoError(t, err)
			if won {
				atomic.AddInt32(&wins, 1)
			}
		}(i)
	}
	wg.Wait()

	require.EqualValues(t, 1, wins, "exactly one of %d concurrent CAS writers must win", N)
	var got Task
	require.NoError(t, DB.First(&got, task.Id).Error)
	require.True(t, got.Status.IsTerminal())
}

func TestUpdateTaskStatus_LoserCannotOverwrite(t *testing.T) {
	setupTaskTestDB(t)
	task := newQueuedTask(t)

	won, err := UpdateTaskStatus(task.Id, TaskStatusQueued, map[string]interface{}{
		"status":     TaskStatusSuccess,
		"result_url": "https://example.com/video.mp4",
	})
	require.NoError(t, err)
	require.True(t, won)

	// a stale writer still holding the QUEUED snapshot must lose
	won, err = UpdateTaskStatus(task.Id, TaskStatusQueued, map[string]interface{}{
		"status":      TaskStatusFailure,
		"fail_reason": "stale",
	})
	require.NoError(t, err)
	require.False(t, won)

	var got Task
	require.NoError(t, DB.First(&got, task.Id).Error)
	require.Equal(t, TaskStatusSuccess, got.Status)
	require.Equal(t, "https://example.com/video.mp4", got.ResultUrl)
	require.Empty(t, got.FailReason)
}

func TestUpdateTaskNonTerminal_DoesNotTouchTerminalTask(t *testing.T) {
	setupTaskTestDB(t)
	task := newQueuedTask(t)
	won, err := UpdateTaskStatus(task.Id, TaskStatusQueued, map[string]interface{}{
		"status":   TaskStatusSuccess,
		"progress": 100,
	})
	require.NoError(t, err)
	require.True(t, won)

	require.NoError(t, UpdateTaskNonTerminal(task.Id, map[string]interface{}{
		"status":   TaskStatusInProgress,
		"progress": 50,
	}))

	var got Task
	require.NoError(t, DB.First(&got, task.Id).Error)
	require.Equal(t, TaskStatusSuccess, got.Status)
	require.Equal(t, 100, got.Progress)
}

func TestListTimeoutTasks_OnlyOldNonTerminal(t *testing.T) {
	setupTaskTestDB(t)
	old := newQueuedTask(t) // SubmitTime = 1000

	recent := newQueuedTask(t)
	require.NoError(t, DB.Model(&Task{}).Where("id = ?", recent.Id).
		Update("submit_time", 9000).Error)

	oldDone := newQueuedTask(t) // also old, but already terminal
	won, err := UpdateTaskStatus(oldDone.Id, TaskStatusQueued, map[string]interface{}{
		"status": TaskStatusSuccess,
	})
	require.NoError(t, err)
	require.True(t, won)

	tasks, err := ListTimeoutTasks(100, 5000)
	require.NoError(t, err)
	require.Len(t, tasks, 1)
	require.Equal(t, old.Id, tasks[0].Id)
}

func TestTaskPrivateData_RoundTripAndHiddenFromJSON(t *testing.T) {
	task := &Task{}
	require.NoError(t, task.SetPrivateData(&TaskPrivateData{
		UpstreamTaskId: "cgt-123",
		Billing: TaskBillingContext{
			TokenId:     7,
			ModelRatio:  2.5,
			GroupRatio:  1,
			OtherRatios: map[string]float64{"seconds": 5},
		},
	}))
	pd, err := task.GetPrivateData()
	require.NoError(t, err)
	require.Equal(t, "cgt-123", pd.UpstreamTaskId)
	require.Equal(t, 7, pd.Billing.TokenId)
	require.Equal(t, 2.5, pd.Billing.ModelRatio)
	require.NotContains(t, mustMarshal(t, task), "cgt-123",
		"private data must never appear in serialized tasks")
}

func mustMarshal(t *testing.T, v interface{}) string {
	t.Helper()
	bytes, err := json.Marshal(v)
	require.NoError(t, err)
	return string(bytes)
}

func TestInsertTask_NormalizesBlankJSONColumns(t *testing.T) {
	// Postgres rejects '' for json-typed columns (SQLSTATE 22P02); sqlite
	// accepts anything, so this asserts the normalization itself.
	setupTaskTestDB(t)
	task := newQueuedTask(t) // inserted with all three json columns blank
	stored, err := GetTaskByTaskId(task.TaskId)
	require.NoError(t, err)
	require.Equal(t, "{}", stored.Properties)
	require.Equal(t, "{}", stored.PrivateData)
	require.Equal(t, "{}", stored.Data)

	pd, err := stored.GetPrivateData()
	require.NoError(t, err)
	require.Empty(t, pd.UpstreamTaskId, "normalized {} must read back as zero value")
}

func TestNormalizeJSONColumn(t *testing.T) {
	require.Equal(t, "{}", NormalizeJSONColumn(""))
	require.Equal(t, "{}", NormalizeJSONColumn("  \n"))
	require.Equal(t, `{"a":1}`, NormalizeJSONColumn(`{"a":1}`))
}
