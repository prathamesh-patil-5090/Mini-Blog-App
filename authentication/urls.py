

from django.urls import path

from authentication.views import LoginView, LogOutView, RefreshView, RegisterView

urlpatterns=[
    path("login/", LoginView.as_view(), name="login"),
    path("register/", RegisterView.as_view(), name="register"),
    path("refresh/", RefreshView.as_view(), name="refresh-token"),
    path("logout/", LogOutView.as_view(), name="logout")
]
