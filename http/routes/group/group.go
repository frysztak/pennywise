package group

import (
	"context"
	"errors"
	"pennywise/calc"
	"pennywise/db"
	"pennywise/db/database"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"
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
	session := helpers.GetSessionInfo(ctx)
	group, err := db.Queries.CreateGroup(ctx, database.CreateGroupParams{
		ID:              uuid.NewString(),
		Name:            r.Name,
		Description:     &r.Description,
		CreatedBy:       session.UserID,
		DefaultCurrency: r.DefaultCurrency,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	_, err = db.Queries.AddUserToGroup(ctx, database.AddUserToGroupParams{
		UserID:  session.UserID,
		GroupID: group.ID,
		Weight:  1.0,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return &apiv1.CreateExpenseGroupResponse{
		Id:          group.ID,
		Name:        group.Name,
		Description: *group.Description,
		CreatedBy:   group.CreatedBy,
	}, nil
}

func (s *GroupService) UpdateGroup(ctx context.Context, r *apiv1.UpdateGroupRequest) (*apiv1.CreateExpenseGroupResponse, error) {
	// TODO: check if user is admin

	group, err := db.Queries.UpdateGroup(ctx, database.UpdateGroupParams{
		ID:              r.Id,
		Name:            r.Name,
		Description:     &r.Description,
		DefaultCurrency: r.DefaultCurrency,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return &apiv1.CreateExpenseGroupResponse{
		Id:          group.ID,
		Name:        group.Name,
		Description: *group.Description,
		CreatedBy:   group.CreatedBy,
	}, nil
}

func (s *GroupService) DeleteGroup(ctx context.Context, r *apiv1.DeleteGroupRequest) (*emptypb.Empty, error) {
	session := helpers.GetSessionInfo(ctx)

	// Fetch the group to check who created it
	group, err := db.Queries.GetGroupById(ctx, r.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}

	// Check if the current user is the creator
	if group.CreatedBy != session.UserID {
		return nil, connect.NewError(connect.CodePermissionDenied, nil)
	}

	// Delete the group (CASCADE will handle related records)
	err = db.Queries.DeleteGroup(ctx, r.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return &emptypb.Empty{}, nil
}

func (s *GroupService) AddUserToGroup(ctx context.Context, r *apiv1.AddUserToGroupRequest) (*emptypb.Empty, error) {
	userInGroup, err := db.Queries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		UserID:  r.UserId,
		GroupID: r.GroupId,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if userInGroup == 1 {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("user is already a member of this group"))
	}

	_, err = db.Queries.AddUserToGroup(ctx, database.AddUserToGroupParams{
		UserID:  r.UserId,
		GroupID: r.GroupId,
		Weight:  1.0,
	})

	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return &emptypb.Empty{}, nil
}

func (s *GroupService) RemoveUserFromGroup(ctx context.Context, r *apiv1.RemoveUserFromGroupRequest) (*emptypb.Empty, error) {
	err := db.Queries.RemoveUserFromGroup(ctx, database.RemoveUserFromGroupParams{
		UserID:  r.UserId,
		GroupID: r.GroupId,
	})

	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return &emptypb.Empty{}, nil
}

func (s *GroupService) UpdateUserWeight(ctx context.Context, r *apiv1.UpdateUserWeightRequest) (*emptypb.Empty, error) {
	// Verify the user is in the group
	userInGroup, err := db.Queries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		UserID:  r.UserId,
		GroupID: r.GroupId,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if userInGroup != 1 {
		return nil, connect.NewError(connect.CodeNotFound,
			errors.New("user is not a member of this group"))
	}

	// Update the user's weight
	err = db.Queries.UpdateUserWeight(ctx, database.UpdateUserWeightParams{
		UserID:  r.UserId,
		GroupID: r.GroupId,
		Weight:  r.Weight,
	})

	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return &emptypb.Empty{}, nil
}

func (s *GroupService) GetUserGroups(ctx context.Context, r *emptypb.Empty) (*apiv1.GetUserGroupsResponse, error) {
	session := helpers.GetSessionInfo(ctx)

	groups, err := db.Queries.GetGroupsByUserId(ctx, session.UserID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	pbGroups := make([]*apiv1.UserGroup, len(groups))
	for i, v := range groups {
		// Calculate balance for this group
		members, err := db.Queries.GetGroupMembers(ctx, *v.GroupID)
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, err)
		}

		expenses, err := db.Queries.GetGroupExpenses(ctx, *v.GroupID)
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, err)
		}

		transfers, err := db.Queries.GetGroupTransfersForBalance(ctx, *v.GroupID)
		if err != nil {
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
		totalSpendingRows, err := db.Queries.GetGroupTotalSpending(ctx, *v.GroupID)
		if err != nil {
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

	return &apiv1.GetUserGroupsResponse{
		Groups: pbGroups,
	}, nil
}

func (s *GroupService) GetGroupActivity(ctx context.Context, r *apiv1.GetGroupActivityRequest) (*apiv1.GetGroupActivityResponse, error) {
	// Fetch expenses
	expenses, err := db.Queries.GetGroupExpenses(ctx, r.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Fetch transfers
	transfers, err := db.Queries.GetGroupTransfers(ctx, r.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Combine into activity items
	items := make([]*apiv1.GetGroupActivityResponse_ActivityItem, 0, len(expenses)+len(transfers))

	// Add expenses
	for _, expense := range expenses {
		beneficiariesIds, err := utils.JSONStringToSlice(expense.BeneficiariesIds)
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, err)
		}

		items = append(items, &apiv1.GetGroupActivityResponse_ActivityItem{
			Type: apiv1.GetGroupActivityResponse_ActivityItem_TYPE_EXPENSE,
			Data: &apiv1.GetGroupActivityResponse_ActivityItem_Expense_{
				Expense: &apiv1.GetGroupActivityResponse_ActivityItem_Expense{
					Id:               expense.ID,
					CreatedAt:        timestamppb.New(expense.CreatedAt),
					Name:             expense.Name,
					Description:      expense.Description,
					Currency:         expense.Currency,
					PayerId:          expense.PayerID,
					PayerName:        expense.PayerName,
					Amount:           expense.Amount,
					BeneficiariesIds: beneficiariesIds,
					Date:             timestamppb.New(expense.Date),
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
					CreatedAt:    timestamppb.New(transfer.CreatedAt),
					SenderId:     transfer.SenderID,
					SenderName:   transfer.SenderName,
					ReceiverId:   transfer.ReceiverID,
					ReceiverName: transfer.ReceiverName,
					Amount:       transfer.Amount,
					Currency:     transfer.Currency,
					Date:         timestamppb.New(transfer.Date),
				},
			},
		})
	}

	// Helper to extract timestamps from activity items
	getItemTimes := func(item *apiv1.GetGroupActivityResponse_ActivityItem) (date, createdAt time.Time) {
		if item.Type == apiv1.GetGroupActivityResponse_ActivityItem_TYPE_EXPENSE {
			return item.GetExpense().Date.AsTime(), item.GetExpense().CreatedAt.AsTime()
		}
		return item.GetTransfer().Date.AsTime(), item.GetTransfer().CreatedAt.AsTime()
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

	return &apiv1.GetGroupActivityResponse{
		Items: items,
	}, nil
}
