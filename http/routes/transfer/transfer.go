package transfer

import (
	"context"
	"errors"
	"pennywise/db"
	"pennywise/db/database"
	apiv1 "pennywise/gen/api/v1"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
)

type TransferService struct{}

func NewTransferService() *TransferService {
	return &TransferService{}
}

func (s *TransferService) CreateTransfer(ctx context.Context, r *apiv1.CreateTransferRequest) (*apiv1.CreateTransferResponse, error) {
	// Validate sender is in group
	senderInGroup, err := db.Queries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		UserID:  r.SenderId,
		GroupID: r.GroupId,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if senderInGroup == 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("sender is not a member of this group"))
	}

	// Validate receiver is in group
	receiverInGroup, err := db.Queries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		UserID:  r.ReceiverId,
		GroupID: r.GroupId,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if receiverInGroup == 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("receiver is not a member of this group"))
	}

	// Validate sender != receiver
	if r.SenderId == r.ReceiverId {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("sender and receiver must be different users"))
	}

	// Parse date from request, default to now if not provided
	transferDate := time.Now()
	if r.Date != nil && *r.Date != "" {
		parsed, err := time.Parse(time.RFC3339, *r.Date)
		if err != nil {
			return nil, connect.NewError(connect.CodeInvalidArgument, err)
		}
		transferDate = parsed
	}

	transfer, err := db.Queries.CreateTransfer(ctx, database.CreateTransferParams{
		ID:         uuid.NewString(),
		GroupID:    r.GroupId,
		SenderID:   r.SenderId,
		ReceiverID: r.ReceiverId,
		Amount:     int64(r.Amount * 100),
		Currency:   r.Currency,
		CreatedAt:  transferDate,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return &apiv1.CreateTransferResponse{Id: transfer.ID}, nil
}

func (s *TransferService) GetGroupTransfers(ctx context.Context, r *apiv1.GetGroupTransfersRequest) (*apiv1.GetGroupTransfersResponse, error) {
	rows, err := db.Queries.GetGroupTransfers(ctx, r.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	transfers := make([]*apiv1.GetGroupTransfersResponse_Transfer, 0, len(rows))
	for _, row := range rows {
		transfers = append(transfers, &apiv1.GetGroupTransfersResponse_Transfer{
			Id:           row.ID,
			CreatedAt:    row.CreatedAt.Format(time.RFC3339),
			SenderId:     row.SenderID,
			SenderName:   row.SenderName,
			ReceiverId:   row.ReceiverID,
			ReceiverName: row.ReceiverName,
			Amount:       row.Amount,
			Currency:     row.Currency,
		})
	}

	return &apiv1.GetGroupTransfersResponse{Transfers: transfers}, nil
}

func (s *TransferService) UpdateTransfer(ctx context.Context, r *apiv1.UpdateTransferRequest) (*apiv1.UpdateTransferResponse, error) {
	// Get existing transfer to find group_id for validation
	existing, err := db.Queries.GetTransferById(ctx, r.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}

	// Validate sender is in group
	senderInGroup, err := db.Queries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		UserID:  r.SenderId,
		GroupID: existing.GroupID,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if senderInGroup == 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("sender is not a member of this group"))
	}

	// Validate receiver is in group
	receiverInGroup, err := db.Queries.IsUserInGroup(ctx, database.IsUserInGroupParams{
		UserID:  r.ReceiverId,
		GroupID: existing.GroupID,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if receiverInGroup == 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("receiver is not a member of this group"))
	}

	// Validate sender != receiver
	if r.SenderId == r.ReceiverId {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			errors.New("sender and receiver must be different users"))
	}

	transfer, err := db.Queries.UpdateTransfer(ctx, database.UpdateTransferParams{
		ID:         r.Id,
		SenderID:   r.SenderId,
		ReceiverID: r.ReceiverId,
		Amount:     int64(r.Amount * 100),
		Currency:   r.Currency,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return &apiv1.UpdateTransferResponse{Id: transfer.ID}, nil
}

func (s *TransferService) DeleteTransfer(ctx context.Context, r *apiv1.DeleteTransferRequest) (*apiv1.DeleteTransferResponse, error) {
	err := db.Queries.DeleteTransfer(ctx, r.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return &apiv1.DeleteTransferResponse{}, nil
}
