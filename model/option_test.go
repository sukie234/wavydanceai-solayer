package model

import (
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/common/config"
)

func setupOptionTestDB(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:?_busy_timeout=5000"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}))
	DB = db
	config.OptionMap = make(map[string]string)
}

func TestUpdateOptionsPersistsAllKeys(t *testing.T) {
	setupOptionTestDB(t)
	require.NoError(t, UpdateOptions(map[string]string{"TestKeyA": "1", "TestKeyB": "2"}))

	var rows []Option
	require.NoError(t, DB.Find(&rows).Error)
	got := map[string]string{}
	for _, r := range rows {
		got[r.Key] = r.Value
	}
	require.Equal(t, "1", got["TestKeyA"])
	require.Equal(t, "2", got["TestKeyB"])

	require.Equal(t, "1", config.OptionMap["TestKeyA"])
	require.Equal(t, "2", config.OptionMap["TestKeyB"])
}

func TestUpdateOptionsRollsBackOnError(t *testing.T) {
	setupOptionTestDB(t)
	// Drop the table so the transactional writes fail: the whole batch must roll
	// back and nothing may leak into the in-memory OptionMap. (sqlite has no
	// constraint we can violate to fail only the 2nd write, so we force the DB
	// error to assert the all-or-nothing property.)
	require.NoError(t, DB.Migrator().DropTable(&Option{}))

	require.Error(t, UpdateOptions(map[string]string{"TestKeyA": "1", "TestKeyB": "2"}))

	_, hasA := config.OptionMap["TestKeyA"]
	_, hasB := config.OptionMap["TestKeyB"]
	require.False(t, hasA, "OptionMap must not contain a key from a failed batch")
	require.False(t, hasB, "OptionMap must not contain a key from a failed batch")
}

func TestUpdateOptionsEmptyIsNoop(t *testing.T) {
	setupOptionTestDB(t)
	require.NoError(t, UpdateOptions(map[string]string{}))
}

func TestUpdateOptionsSurfacesPostCommitError(t *testing.T) {
	setupOptionTestDB(t)
	// ModelRatio carries invalid JSON: the DB write commits but the post-commit
	// updateOptionMap (ratio parse) fails. UpdateOptions must surface the error
	// and resync the in-memory map from DB rather than swallowing it.
	require.Error(t, UpdateOptions(map[string]string{"ModelRatio": "not-json"}))
}
