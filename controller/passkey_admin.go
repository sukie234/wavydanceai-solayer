package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/songquanpeng/one-api/model"
)

// AdminDeleteUserPasskey: DELETE /api/user/:id/passkeys/:credId
// Admin scope — skips the user-ownership check used in DeleteMyPasskey.
func AdminDeleteUserPasskey(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("id"))
	if err != nil || userId == 0 {
		respondError(c, errPasskeyNotFound)
		return
	}
	credId, err := strconv.Atoi(c.Param("credId"))
	if err != nil {
		respondError(c, errPasskeyNotFound)
		return
	}
	row, err := model.GetPasskeyByIdForUser(credId, userId)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": errPasskeyNotFound.Error()})
			return
		}
		respondError(c, err)
		return
	}
	if err := model.AdminDeletePasskey(row.Id); err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// AdminClearUserPasskeys: DELETE /api/user/:id/passkeys
func AdminClearUserPasskeys(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("id"))
	if err != nil || userId == 0 {
		respondError(c, errPasskeyNotFound)
		return
	}
	if err := model.DeleteAllPasskeysByUserId(userId); err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
