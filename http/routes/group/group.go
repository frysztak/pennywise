package group

import (
	"context"
	"pennywise/calc"
	"pennywise/db"
	"pennywise/db/database"
	apiv1 "pennywise/gen/api/v1"
	"pennywise/http/helpers"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/emptypb"
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
		ID:          r.Id,
		Name:        r.Name,
		Description: &r.Description,
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

func (s *GroupService) AddUserToGroup(ctx context.Context, r *apiv1.AddUserToGroupRequest) (*emptypb.Empty, error) {
	_, err := db.Queries.AddUserToGroup(ctx, database.AddUserToGroupParams{
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

		groupBalance := calc.ComputeGroupBalance(&members, &expenses, v.DefaultCurrency)

		// Build member balances
		memberBalances := make([]*apiv1.MemberBalance, 0, len(members))
		for _, member := range members {
			memberBalances = append(memberBalances, &apiv1.MemberBalance{
				UserId:   member.UserID,
				UserName: member.UserName,
				Balance:  groupBalance[member.UserID],
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

