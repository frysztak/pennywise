package group

import (
	"context"
	"errors"
	"pennywise/calc"
	"pennywise/db"
	"pennywise/db/database"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"
	"pennywise/log"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func (s *GroupService) GetGroupStats(ctx context.Context, r *apiv1.GetGroupStatsRequest) (*apiv1.GetGroupStatsResponse, error) {
	logger := log.FromContext(ctx)
	session := helpers.GetSessionInfo(ctx)

	// Verify user is group member
	userInGroup, err := db.ReadQueries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		GroupID: r.GroupId,
		UserID:  session.UserID,
	})
	if err != nil {
		logger.Error("failed to check group membership", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if !userInGroup {
		logger.Warn("group stats requested by non-member", "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodePermissionDenied, errors.New("not a group member"))
	}

	group, err := db.ReadQueries.GetGroupById(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	members, err := db.ReadQueries.GetGroupMembers(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group members", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	expenses, err := db.ReadQueries.GetGroupExpenses(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group expenses", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	transfers, err := db.ReadQueries.GetGroupTransfers(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group transfers", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	totalSpendingRows, err := db.ReadQueries.GetGroupTotalSpending(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group total spending", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	paid, share := calc.ComputeMemberSpending(&members, &expenses)
	timeline := calc.ComputeBalanceTimeline(&members, &expenses, &transfers, group.DefaultCurrency)
	spendingTimeline := calc.ComputeSpendingTimeline(&expenses, group.DefaultCurrency)

	totalSpending := make(map[string]int64, len(totalSpendingRows))
	for _, row := range totalSpendingRows {
		totalSpending[row.Currency] = row.TotalAmount
	}

	// Largest single expense per currency.
	largestExpense := make(map[string]int64)
	for _, e := range expenses {
		if e.Amount > largestExpense[e.Currency] {
			largestExpense[e.Currency] = e.Amount
		}
	}

	memberSpending := make([]*apiv1.GetGroupStatsResponse_MemberSpending, 0, len(members))
	for _, m := range members {
		memberSpending = append(memberSpending, &apiv1.GetGroupStatsResponse_MemberSpending{
			UserId:   m.UserID,
			UserName: m.UserName,
			Paid:     emptyIfNil(paid[m.UserID]),
			Share:    emptyIfNil(share[m.UserID]),
		})
	}

	// Pivot timeline (currency -> userID -> cents) into per-currency series.
	seriesByCurrency := make(map[string]*apiv1.GetGroupStatsResponse_BalanceSeries)
	for _, snap := range timeline {
		for currency, balances := range snap.Balances {
			series, ok := seriesByCurrency[currency]
			if !ok {
				series = &apiv1.GetGroupStatsResponse_BalanceSeries{Currency: currency}
				seriesByCurrency[currency] = series
			}
			series.Points = append(series.Points, &apiv1.GetGroupStatsResponse_BalancePoint{
				Date:     timestamppb.New(snap.Date),
				Balances: balances,
			})
		}
	}
	balanceOverTime := make([]*apiv1.GetGroupStatsResponse_BalanceSeries, 0, len(seriesByCurrency))
	for _, series := range seriesByCurrency {
		balanceOverTime = append(balanceOverTime, series)
	}

	// Pivot cumulative spending (currency -> total) into per-currency series.
	spendByCurrency := make(map[string]*apiv1.GetGroupStatsResponse_SpendSeries)
	for _, snap := range spendingTimeline {
		for currency, total := range snap.Total {
			series, ok := spendByCurrency[currency]
			if !ok {
				series = &apiv1.GetGroupStatsResponse_SpendSeries{Currency: currency}
				spendByCurrency[currency] = series
			}
			series.Points = append(series.Points, &apiv1.GetGroupStatsResponse_SpendPoint{
				Date:  timestamppb.New(snap.Date),
				Total: total,
			})
		}
	}
	cumulativeSpending := make([]*apiv1.GetGroupStatsResponse_SpendSeries, 0, len(spendByCurrency))
	for _, series := range spendByCurrency {
		cumulativeSpending = append(cumulativeSpending, series)
	}

	logger.Info("group stats retrieved", "group_id", r.GroupId, "expenses", len(expenses), "transfers", len(transfers))

	return &apiv1.GetGroupStatsResponse{
		TotalSpending:   totalSpending,
		MemberSpending:  memberSpending,
		BalanceOverTime: balanceOverTime,
		ExpenseCount:       int64(len(expenses)),
		TransferCount:      int64(len(transfers)),
		LargestExpense:     largestExpense,
		CumulativeSpending: cumulativeSpending,
	}, nil
}

func emptyIfNil(m calc.PerCurrencyBalance) map[string]int64 {
	if m == nil {
		return map[string]int64{}
	}
	return m
}
