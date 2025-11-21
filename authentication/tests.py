from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from authentication.serializers import RegisterSerializer
from authentication.views import LoginView, RefreshView

from .models import User


class AuthenticationTestCase(TestCase):
    def setUp(self):
        self.username = "testuser1"
        self.email = "testuser1@test.com"
        self.username_or_email = self.username or self.email
        self.password = "testPass@1"
        self.user = User.objects.create_user(
            username=self.username,
            email=self.email,
            password=self.password,
            first_name= "Test",
            last_name="User1"
        )
        self.factory = APIRequestFactory()

    def test_register_serializer_creates_user(self):
        data={
            "first_name": "New",
            "last_name": "Last",
            "username": "newuser",
            "email":"newuser@test.com",
            "password": "newPass!23"
        }
        serializer = RegisterSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        user = serializer.save()

        assert user.pk is not None
        assert user.username == data['username']
        assert user.email == data['email']
        assert user.check_password(data['password'])

    def  test_login_view_returns_token(self):
        data={
            "username_or_email" : self.username_or_email,
            "password": self.password
        }
        request = self.factory.post('/login/', data, format='json')
        view = LoginView.as_view()
        response = view(request)

        assert response.status_code == 200
        assert "access" in response.data
        assert "refresh" in response.data

    def test_refresh_view_returns_new_tokens_for_authenticated_user(self):
            request = self.factory.post("/refresh/", {}, format="json")
            # Mark the request as authenticated
            force_authenticate(request, user=self.user)

            view = RefreshView.as_view()
            response = view(request)

            assert response.status_code == 200
            assert "access" in response.data
            assert "refresh" in response.data