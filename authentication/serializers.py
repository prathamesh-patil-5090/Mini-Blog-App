from django.contrib.auth import authenticate
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "first_name", "last_name", "email", "username")

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ("id", "first_name", "last_name", "email", "username", "password")

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    # Add login field directly instead of modifying in __init__
    login = serializers.CharField(help_text='Enter your username or email address')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Remove the username field since we're using login
        if 'username' in self.fields:
            del self.fields['username']

    def validate(self, attrs):
        login = attrs.get('login')
        password = attrs.get('password')

        if not login or not password:
            raise serializers.ValidationError('Both login and password are required.')

        # Determine if login is email or username
        if '@' in login:
            try:
                user = User.objects.get(email=login)
                username = user.username
            except User.DoesNotExist:
                raise serializers.ValidationError('Invalid email or password.')
        else:
            username = login

        # Authenticate with username and password
        user = authenticate(username=username, password=password)

        if not user:
            raise serializers.ValidationError('Invalid credentials.')

        if not user.is_active:
            raise serializers.ValidationError('User account is disabled.')


        # Update attrs with actual username for parent validation
        attrs['username'] = username
        attrs.pop('login') 

        data = super().validate(attrs)
        
        data['user'] = UserSerializer(user).data
        
        return data
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        token['email'] = user.email
        return token
