package calc

import (
	"pennywise/db/database"
	"pennywise/utils"
	"testing"
)

func TestComputeGroupBalance(t *testing.T) {
	testcases := []struct {
		members  []database.GetGroupMembersRow
		expenses []database.GetGroupExpensesRow
		want     GroupBalance
	}{
		[]database.GetGroupMembersRow{
			{UserID: "uA", Weight: 1.0},
			{UserID: "uB", Weight: 1.0},
		},
		[]database.GetGroupExpensesRow{
			{ID: "eA",
				Currency:         "PLN",
				GroupID:          "gA",
				RecurringID:      nil,
				PayerID:          utils.PtrFrom("uA"),
				Amount:           utils.PtrFrom(int64(2137)),
				BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
			}},
		GroupBalance{
			"uA": PerCurrencyBalance{"PLN": 1068.5},
			"uB": PerCurrencyBalance{"PLN": -1068.5},
		},
	}

	members := []database.GetGroupMembersRow{
		{UserID: "uA", Weight: 1.0},
		{UserID: "uB", Weight: 1.0},
	}
	expenses := []database.GetGroupExpensesRow{
		{ID: "eA",
			Currency:         "PLN",
			GroupID:          "gA",
			RecurringID:      nil,
			PayerID:          utils.PtrFrom("uA"),
			Amount:           utils.PtrFrom(int64(2137)),
			BeneficiariesIds: utils.SliceToJSONString("uA", "uB"),
		}}

	balance := ComputeGroupBalance(&members, &expenses)
	t.Log(balance)
	// var expected float32 = 0.0

	// if balance != expected {
	// t.Errorf(`Expected %f, got %f`, expected, balance)
	// }
}
