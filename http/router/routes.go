package router

import (
	"net/http"

	"pennywise/config"
	"pennywise/http/middleware"
	"pennywise/http/routes/admin"
	"pennywise/http/routes/auth"
	"pennywise/http/routes/avatar"
	"pennywise/http/routes/expense"
	"pennywise/http/routes/group"
	"pennywise/http/routes/receipt"
	"pennywise/http/routes/recurring_expense"
	"pennywise/http/routes/transfer"
	"pennywise/http/routes/user"
	"pennywise/log"

	"pennywise/gen/api/v1/apiv1connect"

	"connectrpc.com/connect"
	"connectrpc.com/grpcreflect"
	"connectrpc.com/validate"
)

func InitRouter(mux *http.ServeMux) {
	// Initialize OIDC if configured
	if config.Config.OIDCEnabled() {
		auth.InitOIDCAuth()
		mux.HandleFunc("GET /auth/oidc/login", auth.HandlerOIDCLogin)
		mux.HandleFunc("GET /auth/oidc/callback", auth.HandlerOIDCCallback)
	}

	session := middleware.SessionMiddleware()

	// Avatar endpoint (no auth required)
	mux.HandleFunc("GET /avatar/{userId}", avatar.HandleAvatar)
	mux.HandleFunc("GET /group-image/{groupId}", group.HandleGroupImage)

	// Create interceptors once and reuse them across all services
	// Order matters: Logging -> Validation
	interceptors := connect.WithInterceptors(
		log.LoggingInterceptor(),
		validate.NewInterceptor(),
	)

	reflector := grpcreflect.NewStaticReflector(
		apiv1connect.AuthServiceName,
		apiv1connect.UserServiceName,
		apiv1connect.AdminServiceName,
		apiv1connect.GroupServiceName,
		apiv1connect.ExpenseServiceName,
		apiv1connect.TransferServiceName,
		apiv1connect.RecurringExpenseServiceName,
		apiv1connect.ReceiptServiceName,
	)
	mux.Handle(grpcreflect.NewHandlerV1(reflector))
	mux.Handle(grpcreflect.NewHandlerV1Alpha(reflector))

	path, handler := apiv1connect.NewAuthServiceHandler(
		auth.NewAuthService(),
		interceptors,
	)
	mux.Handle(path, session.Wrap(handler))

	path, handler = apiv1connect.NewUserServiceHandler(
		user.NewUserService(),
		interceptors,
	)
	mux.Handle(path, session.Wrap(handler))

	path, handler = apiv1connect.NewAdminServiceHandler(
		admin.NewAdminService(),
		interceptors,
	)
	mux.Handle(path, session.Wrap(handler))

	path, handler = apiv1connect.NewGroupServiceHandler(
		group.NewGroupService(),
		interceptors,
	)
	mux.Handle(path, session.Wrap(handler))

	path, handler = apiv1connect.NewExpenseServiceHandler(
		expense.NewExpenseService(),
		interceptors,
	)
	mux.Handle(path, session.Wrap(handler))

	path, handler = apiv1connect.NewTransferServiceHandler(
		transfer.NewTransferService(),
		interceptors,
	)
	mux.Handle(path, session.Wrap(handler))

	path, handler = apiv1connect.NewRecurringExpenseServiceHandler(
		recurring_expense.NewRecurringExpenseService(),
		interceptors,
	)
	mux.Handle(path, session.Wrap(handler))

	path, handler = apiv1connect.NewReceiptServiceHandler(
		receipt.NewReceiptService(),
		interceptors,
	)
	mux.Handle(path, session.Wrap(handler))

	// return mux

	// return c.Handler(mux)
}
