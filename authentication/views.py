from django.conf import settings
from rest_framework import generics, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.status import HTTP_200_OK, HTTP_201_CREATED, HTTP_400_BAD_REQUEST
from rest_framework.views import APIView
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenBlacklistView, TokenObtainPairView

from authentication.serializers import (
    CustomTokenObtainPairSerializer,
    RegisterSerializer,
    UserSerializer,
)


def set_jwt_cookie(response, access_token=None, refresh_token=None):
    secure_cookie = getattr(settings, "SESSION_COOIE_SECURE", False) or getattr(settings, "SESSION_COOIE_SECURE", False)
    access_max_age = 86400
    refresh_max_age = 604800
    if access_token:
        response.set_cookie(
            key="access_token",
            value="access_token",
            httponly=True,
            secure=secure_cookie,
            max_age=access_max_age,
            path="/"
        )
    if refresh_token:
        response.set_cookie(
            key="refresh_token",
            value="refresh_token",
            httponly=True,
            secure=secure_cookie,
            max_age=refresh_max_age,
            path="/"
        )

class LoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)

        if response.status_code == HTTP_200_OK:
            access = response.data.get('access')
            refresh = response.data.get('refresh')

            set_jwt_cookie(response, access, refresh)
        return response

class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            access = str(refresh.access_token)
            refresh_str = str(refresh)


            response = Response({
               "message": "User created successfully",
               "user": UserSerializer(user).data,
               "access_token" : access,
               "refresh_token" : refresh_str
            }, status=HTTP_201_CREATED)
            set_jwt_cookie(response, access, refresh_str)
            return response
        else:
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

class RefreshView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        if not user.is_active:
            raise AuthenticationFailed("User is not active")

        refresh = RefreshToken.for_user(user)
        response = Response({
            "refresh" : str(refresh),
            "access" : str(refresh.access_token)
        }, status=HTTP_200_OK)

        set_jwt_cookie(response, str(refresh.access_token), str(refresh))
        
        return response

class LogOutView(TokenBlacklistView):
    def post(self, request):
        response = super().post(request)

        if response.status_code == status.HTTP_200_OK:
            resp = Response({
                "message" : "User logged out successfully"
            }, status=HTTP_200_OK)
            resp.delete_cookie("access_token", path="/")
            resp.delete_cookie("refresh_token", path="/")
        return response

class ProfileView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def get(self):
        request = self.request
        user_data = UserSerializer(request.user).data

        return user_data
