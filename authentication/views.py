from rest_framework import generics, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.status import HTTP_200_OK, HTTP_201_CREATED, HTTP_400_BAD_REQUEST
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenBlacklistView, TokenObtainPairView

from authentication.serializers import (
    CustomTokenObtainPairSerializer,
    RegisterSerializer,
    UserSerializer,
)


class LoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response({
               "message": "User created successfully",
               "user": UserSerializer(user).data
            }, status=HTTP_201_CREATED)
        else:
            return Response(serializer.errors, status=HTTP_400_BAD_REQUEST)

class RefreshView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        if not user.is_active:
            raise AuthenticationFailed("User is not active")

        refresh = RefreshToken.for_user(user)
        return Response({
            "refresh" : str(refresh),
            "access" : str(refresh.access_token)
        }, status=HTTP_200_OK)

class LogOutView(TokenBlacklistView):
    def post(self, request):
        response = super().post(request)

        if response.status_code == status.HTTP_200_OK:
            return Response({
                "message" : "User logged out successfully"
            }, status=HTTP_200_OK)
        return response

class ProfileView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def get(self):
        request = self.request
        user_data = UserSerializer(request.user).data

        return user_data
