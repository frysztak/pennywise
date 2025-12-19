package router

import (
	"net/http"

	"pennywise/http/middleware"
	"pennywise/http/routes/admin"
	"pennywise/http/routes/auth"
	"pennywise/http/routes/expense"
	"pennywise/http/routes/group"
	"pennywise/http/routes/transfer"
	"pennywise/http/routes/user"

	"pennywise/gen/api/v1/apiv1connect"

	"connectrpc.com/connect"
	"connectrpc.com/grpcreflect"
	"connectrpc.com/validate"
)

func InitRouter(mux *http.ServeMux) {
	// I've had it fail with "Get "https://auth.raniuszek.cloud/.well-known/openid-configuration": dial tcp 5.231.56.104:443: connect: connection refused"
	// auth.InitAuth()
	// r.Use(middleware.Logger)

	//c := cors.New(cors.Options{
	//	AllowedOrigins: []string{"http://localhost:5173"},
	//	AllowedMethods: connectcors.AllowedMethods(),
	//	AllowedHeaders: connectcors.AllowedHeaders(),
	//	ExposedHeaders: connectcors.ExposedHeaders(),
	//	MaxAge:         7200, // 2 hours in seconds
	//})
	session := middleware.SessionMiddleware()

	reflector := grpcreflect.NewStaticReflector(
		apiv1connect.AuthServiceName,
		apiv1connect.UserServiceName,
		apiv1connect.AdminServiceName,
		apiv1connect.GroupServiceName,
		apiv1connect.ExpenseServiceName,
		apiv1connect.TransferServiceName,
	)
	mux.Handle(grpcreflect.NewHandlerV1(reflector))
	mux.Handle(grpcreflect.NewHandlerV1Alpha(reflector))

	path, handler := apiv1connect.NewAuthServiceHandler(
		auth.NewAuthService(),
		connect.WithInterceptors(validate.NewInterceptor()),
	)
	mux.Handle(path, session.Wrap(handler))

	path, handler = apiv1connect.NewUserServiceHandler(
		user.NewUserService(),
		connect.WithInterceptors(validate.NewInterceptor()),
	)
	mux.Handle(path, session.Wrap(handler))

	path, handler = apiv1connect.NewAdminServiceHandler(
		admin.NewAdminService(),
		connect.WithInterceptors(validate.NewInterceptor()),
	)
	mux.Handle(path, session.Wrap(handler))

	path, handler = apiv1connect.NewGroupServiceHandler(
		group.NewGroupService(),
		connect.WithInterceptors(validate.NewInterceptor()),
	)
	mux.Handle(path, session.Wrap(handler))

	path, handler = apiv1connect.NewExpenseServiceHandler(
		expense.NewExpenseService(),
		connect.WithInterceptors(validate.NewInterceptor()),
	)
	mux.Handle(path, session.Wrap(handler))

	path, handler = apiv1connect.NewTransferServiceHandler(
		transfer.NewTransferService(),
		connect.WithInterceptors(validate.NewInterceptor()),
	)
	mux.Handle(path, session.Wrap(handler))

	// return mux

	// return c.Handler(mux)
}
