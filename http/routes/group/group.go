package group

import (
	"context"
	"errors"
	"pennywise/calc"
	"pennywise/db"
	"pennywise/db/database"
	"pennywise/db/overrides"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"
	"pennywise/log"
	"pennywise/utils"
	"sort"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type GroupService struct{}

func NewGroupService() *GroupService {
	return &GroupService{}
}

func (s *GroupService) CreateExpenseGroup(ctx context.Context, r *apiv1.CreateExpenseGroupRequest) (*apiv1.CreateExpenseGroupResponse, error) {
	logger := log.FromContext(ctx)
	session := helpers.GetSessionInfo(ctx)

	group, err := db.WriteQueries.CreateGroup(ctx, database.CreateGroupParams{
		ID:              uuid.NewString(),
		Name:            r.Name,
		Description:     &r.Description,
		CreatedBy:       session.UserID,
		CreatedAt:       overrides.TextTime{Time: time.Now()},
		DefaultCurrency: r.DefaultCurrency,
	})
	if err != nil {
		logger.Error("failed to create group", "error", err, "name", r.Name)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	_, err = db.WriteQueries.AddUserToGroup(ctx, database.AddUserToGroupParams{
		UserID:  session.UserID,
		GroupID: group.ID,
		Weight:  1.0,
		AddedAt: overrides.TextTime{Time: time.Now()},
	})
	if err != nil {
		logger.Error("failed to add creator to group", "error", err, "group_id", group.ID)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("group created successfully", "group_id", group.ID, "name", group.Name)

	return &apiv1.CreateExpenseGroupResponse{
		Id:          group.ID,
		Name:        group.Name,
		Description: *group.Description,
		CreatedBy:   group.CreatedBy,
	}, nil
}

func (s *GroupService) UpdateGroup(ctx context.Context, r *apiv1.UpdateGroupRequest) (*apiv1.UpdateGroupResponse, error) {
	logger := log.FromContext(ctx)
	// TODO: check if user is admin

	group, err := db.WriteQueries.UpdateGroup(ctx, database.UpdateGroupParams{
		ID:              r.Id,
		Name:            r.Name,
		Description:     &r.Description,
		DefaultCurrency: r.DefaultCurrency,
	})
	if err != nil {
		logger.Error("failed to update group", "error", err, "group_id", r.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("group updated successfully", "group_id", group.ID, "name", group.Name)

	return &apiv1.UpdateGroupResponse{
		Id:          group.ID,
		Name:        group.Name,
		Description: *group.Description,
		CreatedBy:   group.CreatedBy,
	}, nil
}

func (s *GroupService) DeleteGroup(ctx context.Context, r *apiv1.DeleteGroupRequest) (*emptypb.Empty, error) {
	logger := log.FromContext(ctx)
	session := helpers.GetSessionInfo(ctx)

	// Fetch the group to check who created it
	group, err := db.ReadQueries.GetGroupById(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group for deletion", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeNotFound, err)
	}

	// Check if the current user is the creator
	if group.CreatedBy != session.UserID {
		logger.Warn("unauthorized group deletion attempt", "group_id", r.GroupId, "created_by", group.CreatedBy)
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	// Delete the group (CASCADE will handle related records)
	err = db.WriteQueries.DeleteGroup(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to delete group", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("group deleted successfully", "group_id", r.GroupId)

	return &emptypb.Empty{}, nil
}

func (s *GroupService) AddUserToGroup(ctx context.Context, r *apiv1.AddUserToGroupRequest) (*emptypb.Empty, error) {
	logger := log.FromContext(ctx)
	userInGroup, err := db.ReadQueries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		UserID:  r.UserId,
		GroupID: r.GroupId,
	})
	if err != nil {
		logger.Error("failed to check if user in group", "error", err, "target_user_id", r.UserId, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if userInGroup {
		logger.Warn("attempt to add user already in group", "target_user_id", r.UserId, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("user is already a member of this group"))
	}

	_, err = db.WriteQueries.AddUserToGroup(ctx, database.AddUserToGroupParams{
		UserID:  r.UserId,
		GroupID: r.GroupId,
		Weight:  1.0,
		AddedAt: overrides.TextTime{Time: time.Now()},
	})

	if err != nil {
		logger.Error("failed to add user to group", "error", err, "target_user_id", r.UserId, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("user added to group successfully", "target_user_id", r.UserId, "group_id", r.GroupId)

	return &emptypb.Empty{}, nil
}

func (s *GroupService) RemoveUserFromGroup(ctx context.Context, r *apiv1.RemoveUserFromGroupRequest) (*emptypb.Empty, error) {
	logger := log.FromContext(ctx)
	err := db.WriteQueries.RemoveUserFromGroup(ctx, database.RemoveUserFromGroupParams{
		UserID:  r.UserId,
		GroupID: r.GroupId,
	})

	if err != nil {
		logger.Error("failed to remove user from group", "error", err, "target_user_id", r.UserId, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("user removed from group successfully", "target_user_id", r.UserId, "group_id", r.GroupId)

	return &emptypb.Empty{}, nil
}

func (s *GroupService) UpdateUserWeight(ctx context.Context, r *apiv1.UpdateUserWeightRequest) (*emptypb.Empty, error) {
	logger := log.FromContext(ctx)
	// Verify the user is in the group
	userInGroup, err := db.ReadQueries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		UserID:  r.UserId,
		GroupID: r.GroupId,
	})
	if err != nil {
		logger.Error("failed to check if user in group", "error", err, "target_user_id", r.UserId, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if !userInGroup {
		logger.Warn("attempt to update weight for user not in group", "target_user_id", r.UserId, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeNotFound,
			errors.New("user is not a member of this group"))
	}

	// Update the user's weight
	err = db.WriteQueries.UpdateUserWeight(ctx, database.UpdateUserWeightParams{
		UserID:  r.UserId,
		GroupID: r.GroupId,
		Weight:  r.Weight,
	})

	if err != nil {
		logger.Error("failed to update user weight", "error", err, "target_user_id", r.UserId, "group_id", r.GroupId, "weight", r.Weight)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	logger.Info("user weight updated successfully", "target_user_id", r.UserId, "group_id", r.GroupId, "weight", r.Weight)

	return &emptypb.Empty{}, nil
}

func (s *GroupService) GetUserGroups(ctx context.Context, r *apiv1.GetUserGroupsRequest) (*apiv1.GetUserGroupsResponse, error) {
	logger := log.FromContext(ctx)
	session := helpers.GetSessionInfo(ctx)

	groups, err := db.ReadQueries.GetGroupsByUserId(ctx, session.UserID)
	if err != nil {
		logger.Error("failed to get user groups", "error", err)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	pbGroups := make([]*apiv1.UserGroup, len(groups))
	for i, v := range groups {
		// Calculate balance for this group
		members, err := db.ReadQueries.GetGroupMembers(ctx, *v.GroupID)
		if err != nil {
			logger.Error("failed to get group members", "error", err, "group_id", *v.GroupID)
			return nil, connect.NewError(connect.CodeInternal, err)
		}

		expenses, err := db.ReadQueries.GetGroupExpenses(ctx, *v.GroupID)
		if err != nil {
			logger.Error("failed to get group expenses", "error", err, "group_id", *v.GroupID)
			return nil, connect.NewError(connect.CodeInternal, err)
		}

		transfers, err := db.ReadQueries.GetGroupTransfersForBalance(ctx, *v.GroupID)
		if err != nil {
			logger.Error("failed to get group transfers", "error", err, "group_id", *v.GroupID)
			return nil, connect.NewError(connect.CodeInternal, err)
		}

		groupBalance := calc.ComputeGroupBalance(&members, &expenses, &transfers, v.DefaultCurrency)

		// Build member balances
		memberBalances := make([]*apiv1.MemberBalance, 0, len(members))
		for _, member := range members {
			memberBalances = append(memberBalances, &apiv1.MemberBalance{
				UserId:   member.UserID,
				UserName: member.UserName,
				Balance:  groupBalance[member.UserID],
				Weight:   member.Weight,
			})
		}

		// Get total spending for this group
		totalSpendingRows, err := db.ReadQueries.GetGroupTotalSpending(ctx, *v.GroupID)
		if err != nil {
			logger.Error("failed to get group total spending", "error", err, "group_id", *v.GroupID)
			return nil, connect.NewError(connect.CodeInternal, err)
		}

		totalSpending := make(map[string]int64)
		for _, row := range totalSpendingRows {
			totalSpending[row.Currency] = row.TotalAmount
		}

		pbGroups[i] = &apiv1.UserGroup{
			UserId:               *v.UserID,
			GroupId:              *v.GroupID,
			GroupName:            v.Name,
			GroupDescription:     *v.Description,
			GroupDefaultCurrency: v.DefaultCurrency,
			MemberBalances:       memberBalances,
			TotalSpending:        totalSpending,
		}
	}

	logger.Info("user groups retrieved", "count", len(groups))

	return &apiv1.GetUserGroupsResponse{
		Groups: pbGroups,
	}, nil
}

func (s *GroupService) GetSettlementSuggestions(ctx context.Context, r *apiv1.GetSettlementSuggestionsRequest) (*apiv1.GetSettlementSuggestionsResponse, error) {
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
		logger.Warn("settlement suggestions requested by non-member", "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodePermissionDenied, errors.New("not a group member"))
	}

	// Get group info for default currency
	group, err := db.ReadQueries.GetGroupById(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Get all data needed for balance calculation
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

	transfers, err := db.ReadQueries.GetGroupTransfersForBalance(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group transfers", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Calculate current balances
	balances := calc.ComputeGroupBalance(&members, &expenses, &transfers, group.DefaultCurrency)

	// Collect currencies in group
	currenciesMap := make(map[string]bool)
	for _, currencyBalances := range balances {
		for currency := range currencyBalances {
			currenciesMap[currency] = true
		}
	}
	var currencies []string
	for c := range currenciesMap {
		currencies = append(currencies, c)
	}
	sort.Strings(currencies)

	// Calculate settlements (single currency mode or default)
	var settlements []calc.SettlementSuggestion
	if r.TargetCurrency != nil && *r.TargetCurrency != "" {
		settlements = calc.CalculateSettlementsInCurrency(
			balances,
			*r.TargetCurrency,
			r.ConversionRates,
		)
	} else {
		settlements = calc.CalculateSettlements(balances)
	}

	// Build user name map
	userNames := make(map[string]string)
	for _, member := range members {
		userNames[member.UserID] = member.UserName
	}

	// Build response
	resp := &apiv1.GetSettlementSuggestionsResponse{
		CurrenciesInGroup: currencies,
	}

	for _, s := range settlements {
		resp.Suggestions = append(resp.Suggestions, &apiv1.SettlementSuggestion{
			FromUserId:   s.FromUserID,
			FromUserName: userNames[s.FromUserID],
			ToUserId:     s.ToUserID,
			ToUserName:   userNames[s.ToUserID],
			Amount:       float64(s.Amount) / 100, // Convert cents to dollars
			Currency:     s.Currency,
		})
	}

	logger.Info("settlement suggestions retrieved", "group_id", r.GroupId, "count", len(settlements))

	return resp, nil
}

func (s *GroupService) GetGroupActivity(ctx context.Context, r *apiv1.GetGroupActivityRequest) (*apiv1.GetGroupActivityResponse, error) {
	logger := log.FromContext(ctx)
	// Fetch expenses
	expenses, err := db.ReadQueries.GetGroupExpenses(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group expenses for activity", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Fetch transfers
	transfers, err := db.ReadQueries.GetGroupTransfers(ctx, r.GroupId)
	if err != nil {
		logger.Error("failed to get group transfers for activity", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Combine into activity items
	items := make([]*apiv1.GetGroupActivityResponse_ActivityItem, 0, len(expenses)+len(transfers))

	// Add expenses
	for _, expense := range expenses {
		beneficiariesIds, err := utils.JSONStringToSlice(expense.BeneficiariesIds)
		if err != nil {
			logger.Error("failed to parse beneficiaries IDs", "error", err, "expense_id", expense.ID, "beneficiaries_ids", expense.BeneficiariesIds)
			return nil, connect.NewError(connect.CodeInternal, err)
		}

		var recurringID *string
		if expense.RecurringID != nil {
			recurringID = expense.RecurringID
		}

		items = append(items, &apiv1.GetGroupActivityResponse_ActivityItem{
			Type: apiv1.GetGroupActivityResponse_ActivityItem_TYPE_EXPENSE,
			Data: &apiv1.GetGroupActivityResponse_ActivityItem_Expense_{
				Expense: &apiv1.GetGroupActivityResponse_ActivityItem_Expense{
					Id:               expense.ID,
					CreatedAt:        timestamppb.New(expense.CreatedAt.Time),
					Name:             expense.Name,
					Description:      expense.Description,
					Currency:         expense.Currency,
					PayerId:          expense.PayerID,
					PayerName:        expense.PayerName,
					Amount:           expense.Amount,
					BeneficiariesIds: beneficiariesIds,
					Date:             timestamppb.New(expense.Date.Time),
					RecurringId:      recurringID,
				},
			},
		})
	}

	// Add transfers
	for _, transfer := range transfers {
		items = append(items, &apiv1.GetGroupActivityResponse_ActivityItem{
			Type: apiv1.GetGroupActivityResponse_ActivityItem_TYPE_TRANSFER,
			Data: &apiv1.GetGroupActivityResponse_ActivityItem_Transfer_{
				Transfer: &apiv1.GetGroupActivityResponse_ActivityItem_Transfer{
					Id:           transfer.ID,
					CreatedAt:    timestamppb.New(transfer.CreatedAt.Time),
					SenderId:     transfer.SenderID,
					SenderName:   transfer.SenderName,
					ReceiverId:   transfer.ReceiverID,
					ReceiverName: transfer.ReceiverName,
					Amount:       transfer.Amount,
					Currency:     transfer.Currency,
					Date:         timestamppb.New(transfer.Date.Time),
				},
			},
		})
	}

	// Helper to extract timestamps from activity items
	getItemTimes := func(item *apiv1.GetGroupActivityResponse_ActivityItem) (date, createdAt time.Time) {
		switch item.Type {
		case apiv1.GetGroupActivityResponse_ActivityItem_TYPE_EXPENSE:
			return item.GetExpense().Date.AsTime(), item.GetExpense().CreatedAt.AsTime()
		case apiv1.GetGroupActivityResponse_ActivityItem_TYPE_TRANSFER:
			return item.GetTransfer().Date.AsTime(), item.GetTransfer().CreatedAt.AsTime()
		default:
			return time.Time{}, time.Time{}
		}
	}

	// Sort by date descending (most recent first), then by created_at descending
	sort.Slice(items, func(i, j int) bool {
		dateI, createdAtI := getItemTimes(items[i])
		dateJ, createdAtJ := getItemTimes(items[j])

		if !dateI.Equal(dateJ) {
			return dateI.After(dateJ)
		}
		return createdAtI.After(createdAtJ)
	})

	logger.Info("group activity retrieved", "group_id", r.GroupId, "expenses_count", len(expenses), "transfers_count", len(transfers))

	return &apiv1.GetGroupActivityResponse{
		Items: items,
	}, nil
}
