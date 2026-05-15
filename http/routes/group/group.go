package group

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"pennywise/calc"
	"pennywise/db"
	"pennywise/db/database"
	"pennywise/db/overrides"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"
	"pennywise/log"
	"pennywise/utils"
	"slices"
	"sort"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type activityCursor struct {
	Date      string `json:"date"`
	CreatedAt string `json:"createdAt"`
	ID        string `json:"id"`
}

func encodeActivityCursor(c activityCursor) string {
	b, _ := json.Marshal(c)
	return base64.StdEncoding.EncodeToString(b)
}

func decodeActivityCursor(s string) (activityCursor, error) {
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return activityCursor{}, err
	}
	var c activityCursor
	if err := json.Unmarshal(b, &c); err != nil {
		return activityCursor{}, err
	}
	return c, nil
}

func activityTypeFilterToString(f apiv1.ActivityTypeFilter) string {
	switch f {
	case apiv1.ActivityTypeFilter_ACTIVITY_TYPE_FILTER_EXPENSE:
		return "expense"
	case apiv1.ActivityTypeFilter_ACTIVITY_TYPE_FILTER_TRANSFER:
		return "transfer"
	default:
		return ""
	}
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

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

	if !slices.Contains(r.Currencies, r.DefaultCurrency) {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("default currency must be one of the selected currencies"))
	}

	if err := db.WriteQueries.BulkAddGroupCurrencies(ctx, database.BulkAddGroupCurrenciesParams{
		GroupID:    group.ID,
		Currencies: utils.SliceToJSONString(r.Currencies...),
	}); err != nil {
		logger.Error("failed to seed group currencies", "error", err, "group_id", group.ID)
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

	if !slices.Contains(r.Currencies, r.DefaultCurrency) {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("default currency must be one of the selected currencies"))
	}

	currenciesJSON := utils.SliceToJSONString(r.Currencies...)

	tx, err := db.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		logger.Error("failed to begin transaction", "error", err, "group_id", r.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	defer tx.Rollback()
	qtx := db.WriteQueries.WithTx(tx)

	group, err := qtx.UpdateGroup(ctx, database.UpdateGroupParams{
		ID:              r.Id,
		Name:            r.Name,
		Description:     &r.Description,
		DefaultCurrency: r.DefaultCurrency,
	})
	if err != nil {
		logger.Error("failed to update group", "error", err, "group_id", r.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if err := qtx.ClearGroupCurrencies(ctx, r.Id); err != nil {
		logger.Error("failed to clear group currencies", "error", err, "group_id", r.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if err := qtx.BulkAddGroupCurrencies(ctx, database.BulkAddGroupCurrenciesParams{
		GroupID:    r.Id,
		Currencies: currenciesJSON,
	}); err != nil {
		logger.Error("failed to bulk add group currencies", "error", err, "group_id", r.Id)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if err := tx.Commit(); err != nil {
		logger.Error("failed to commit transaction", "error", err, "group_id", r.Id)
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

		groupCurrencies, err := db.ReadQueries.GetGroupCurrencies(ctx, *v.GroupID)
		if err != nil {
			logger.Error("failed to get group currencies", "error", err, "group_id", *v.GroupID)
			return nil, connect.NewError(connect.CodeInternal, err)
		}
		currencies := make([]string, 0, len(groupCurrencies))
		currencies = append(currencies, v.DefaultCurrency)
		for _, c := range groupCurrencies {
			if c != v.DefaultCurrency {
				currencies = append(currencies, c)
			}
		}

		pbGroups[i] = &apiv1.UserGroup{
			UserId:               *v.UserID,
			GroupId:              *v.GroupID,
			GroupName:            v.Name,
			GroupDescription:     *v.Description,
			GroupDefaultCurrency: v.DefaultCurrency,
			MemberBalances:       memberBalances,
			TotalSpending:        totalSpending,
			Currencies:           currencies,
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

	// Parse pagination
	limit := int64(20)
	if r.Page != nil && r.Page.Limit > 0 {
		limit = int64(r.Page.Limit)
	}
	if limit > 100 {
		limit = 100
	}

	// Decode cursor
	var cursor activityCursor
	if r.Page != nil && r.Page.Cursor != nil && *r.Page.Cursor != "" {
		var err error
		cursor, err = decodeActivityCursor(*r.Page.Cursor)
		if err != nil {
			return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid cursor"))
		}
	}

	typeFilter := activityTypeFilterToString(r.TypeFilter)
	currencyFilter := ""
	if r.CurrencyFilter != nil {
		currencyFilter = *r.CurrencyFilter
	}
	memberFilter := ""
	if r.MemberFilter != nil {
		memberFilter = *r.MemberFilter
	}

	// Run paginated query and count query in parallel
	type countResult struct {
		total int64
		err   error
	}
	countCh := make(chan countResult, 1)
	go func() {
		total, err := db.ReadQueries.GetGroupActivityCount(ctx, database.GetGroupActivityCountParams{
			GroupID:        r.GroupId,
			TypeFilter:     typeFilter,
			CurrencyFilter: currencyFilter,
			MemberFilter:   memberFilter,
		})
		countCh <- countResult{total, err}
	}()

	var cursorCreatedAt overrides.TextTime
	if cursor.CreatedAt != "" {
		t, err := time.Parse(time.RFC3339, cursor.CreatedAt)
		if err != nil {
			return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid cursor"))
		}
		cursorCreatedAt = overrides.TextTime{Time: t}
	}

	rows, err := db.ReadQueries.GetGroupActivityPaginated(ctx, database.GetGroupActivityPaginatedParams{
		Limit:           limit + 1,
		GroupID:         r.GroupId,
		TypeFilter:      typeFilter,
		CurrencyFilter:  currencyFilter,
		MemberFilter:    memberFilter,
		CursorDate:      cursor.Date,
		CursorCreatedAt: cursorCreatedAt,
		CursorID:        cursor.ID,
	})
	if err != nil {
		logger.Error("failed to get paginated activity", "error", err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Detect next page
	hasNext := len(rows) > int(limit)
	if hasNext {
		rows = rows[:limit]
	}

	// Build next cursor from last row
	var nextCursor *string
	if hasNext && len(rows) > 0 {
		last := rows[len(rows)-1]
		nc := encodeActivityCursor(activityCursor{
			Date:      last.Date.Format(time.RFC3339),
			CreatedAt: last.CreatedAt.Format(time.RFC3339),
			ID:        last.ID,
		})
		nextCursor = &nc
	}

	// Wait for count
	cr := <-countCh
	if cr.err != nil {
		logger.Error("failed to get activity count", "error", cr.err, "group_id", r.GroupId)
		return nil, connect.NewError(connect.CodeInternal, cr.err)
	}

	// Build response items
	items := make([]*apiv1.GetGroupActivityResponse_ActivityItem, 0, len(rows))
	for _, row := range rows {
		if row.Type == "expense" {
			var beneficiariesIds []string
			if row.BeneficiariesIds != nil {
				bStr, ok := row.BeneficiariesIds.(string)
				if ok {
					var parseErr error
					beneficiariesIds, parseErr = utils.JSONStringToSlice(bStr)
					if parseErr != nil {
						logger.Error("failed to parse beneficiaries IDs", "error", parseErr, "expense_id", row.ID)
						return nil, connect.NewError(connect.CodeInternal, parseErr)
					}
				}
			}

			items = append(items, &apiv1.GetGroupActivityResponse_ActivityItem{
				Type: apiv1.GetGroupActivityResponse_ActivityItem_TYPE_EXPENSE,
				Data: &apiv1.GetGroupActivityResponse_ActivityItem_Expense_{
					Expense: &apiv1.GetGroupActivityResponse_ActivityItem_Expense{
						Id:               row.ID,
						CreatedAt:        timestamppb.New(row.CreatedAt.Time),
						Name:             row.Description,
						Currency:         row.Currency,
						PayerId:          row.ActorID,
						PayerName:        row.ActorName,
						Amount:           row.Amount,
						BeneficiariesIds: beneficiariesIds,
						Date:             timestamppb.New(row.Date.Time),
						RecurringId:      row.RecurringID,
					},
				},
			})
		} else {
			items = append(items, &apiv1.GetGroupActivityResponse_ActivityItem{
				Type: apiv1.GetGroupActivityResponse_ActivityItem_TYPE_TRANSFER,
				Data: &apiv1.GetGroupActivityResponse_ActivityItem_Transfer_{
					Transfer: &apiv1.GetGroupActivityResponse_ActivityItem_Transfer{
						Id:           row.ID,
						CreatedAt:    timestamppb.New(row.CreatedAt.Time),
						SenderId:     row.ActorID,
						SenderName:   row.ActorName,
						ReceiverId:   derefStr(row.ReceiverID),
						ReceiverName: derefStr(row.ReceiverName),
						Amount:       row.Amount,
						Currency:     row.Currency,
						Date:         timestamppb.New(row.Date.Time),
					},
				},
			})
		}
	}

	logger.Info("group activity retrieved", "group_id", r.GroupId, "count", len(items), "total", cr.total)

	return &apiv1.GetGroupActivityResponse{
		Items: items,
		Page: &apiv1.PageResponse{
			NextCursor: nextCursor,
			TotalCount: cr.total,
		},
	}, nil
}
