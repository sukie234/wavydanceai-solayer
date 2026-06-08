package model

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupPasskeyTestDB(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:?_busy_timeout=5000"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}, &PasskeyCredential{}, &Log{}, &Option{}))
	DB = db
	LOG_DB = db
}

func seedPasskeyUser(t *testing.T) *User {
	t.Helper()
	suffix := randSuffix()
	u := &User{
		Username:    "alice-pk-" + suffix,
		Password:    "x",
		Status:      UserStatusEnabled,
		Role:        1,
		AccessToken: "pk-tok-" + suffix,
		AffCode:     "pk-aff-" + suffix,
	}
	require.NoError(t, DB.Create(u).Error)
	return u
}

func TestPasskeyCRUD(t *testing.T) {
	setupPasskeyTestDB(t)
	u := seedPasskeyUser(t)

	cred := &PasskeyCredential{
		UserId:       u.Id,
		CredentialId: []byte{1, 2, 3, 4},
		PublicKey:    []byte{9, 9, 9},
		SignCount:    0,
		Transports:   `["internal"]`,
		AAGUID:       []byte{0xaa},
		Name:         "MacBook",
		CreatedAt:    time.Now().Unix(),
	}
	require.NoError(t, CreatePasskey(cred))
	require.NotZero(t, cred.Id)

	got, err := GetPasskeyByCredentialId([]byte{1, 2, 3, 4})
	require.NoError(t, err)
	require.Equal(t, "MacBook", got.Name)

	list, err := ListPasskeysByUserId(u.Id)
	require.NoError(t, err)
	require.Len(t, list, 1)

	require.NoError(t, RenamePasskey(cred.Id, u.Id, "MBP 16"))
	got2, err := GetPasskeyByIdForUser(cred.Id, u.Id)
	require.NoError(t, err)
	require.Equal(t, "MBP 16", got2.Name)

	other := seedPasskeyUser(t)
	_, err = GetPasskeyByIdForUser(cred.Id, other.Id)
	require.Error(t, err)
	require.Error(t, DeletePasskey(cred.Id, other.Id))

	require.NoError(t, UpdatePasskeyAfterAuth(cred.Id, 7, 1234567890))
	got3, err := GetPasskeyByIdForUser(cred.Id, u.Id)
	require.NoError(t, err)
	require.EqualValues(t, 7, got3.SignCount)
	require.EqualValues(t, 1234567890, got3.LastUsedAt)

	require.True(t, HasPasskey(u.Id))
	require.False(t, HasPasskey(other.Id))

	require.NoError(t, DeletePasskey(cred.Id, u.Id))
	list2, err := ListPasskeysByUserId(u.Id)
	require.NoError(t, err)
	require.Empty(t, list2)
}

func TestPasskeyCascadeOnUserDelete(t *testing.T) {
	setupPasskeyTestDB(t)
	u := seedPasskeyUser(t)
	cred := &PasskeyCredential{
		UserId: u.Id, CredentialId: []byte{0xde, 0xad}, PublicKey: []byte{1}, CreatedAt: time.Now().Unix(),
	}
	require.NoError(t, CreatePasskey(cred))

	require.NoError(t, DeleteUserById(u.Id))

	list, err := ListPasskeysByUserId(u.Id)
	require.NoError(t, err)
	require.Empty(t, list, "passkeys should be hard-deleted when user is soft-deleted")
}

func TestPasskeyDuplicateCredentialId(t *testing.T) {
	setupPasskeyTestDB(t)
	u := seedPasskeyUser(t)
	require.NoError(t, CreatePasskey(&PasskeyCredential{UserId: u.Id, CredentialId: []byte{1}, PublicKey: []byte{2}, CreatedAt: time.Now().Unix()}))
	err := CreatePasskey(&PasskeyCredential{UserId: u.Id, CredentialId: []byte{1}, PublicKey: []byte{3}, CreatedAt: time.Now().Unix()})
	require.Error(t, err, "uniqueIndex on credential_id must reject duplicates")
}

func TestAdminDeleteIgnoresOwnership(t *testing.T) {
	setupPasskeyTestDB(t)
	u := seedPasskeyUser(t)
	cred := &PasskeyCredential{UserId: u.Id, CredentialId: []byte{7}, PublicKey: []byte{8}, CreatedAt: time.Now().Unix()}
	require.NoError(t, CreatePasskey(cred))
	require.NoError(t, AdminDeletePasskey(cred.Id))

	all, err := ListPasskeysByUserId(u.Id)
	require.NoError(t, err)
	require.Empty(t, all)
}

func TestDeleteAllPasskeysByUserId(t *testing.T) {
	setupPasskeyTestDB(t)
	u := seedPasskeyUser(t)
	for i := byte(1); i <= 3; i++ {
		require.NoError(t, CreatePasskey(&PasskeyCredential{UserId: u.Id, CredentialId: []byte{i}, PublicKey: []byte{i}, CreatedAt: time.Now().Unix()}))
	}
	require.NoError(t, DeleteAllPasskeysByUserId(u.Id))
	all, _ := ListPasskeysByUserId(u.Id)
	require.Empty(t, all)
}
