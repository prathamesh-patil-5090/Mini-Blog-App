from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.pagination import PageNumberPagination

from authentication.serializers import UserSerializer

from .models import Category, Comment, Post


class SetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 1000


class PostSerializer(serializers.ModelSerializer):
    class Meta:
        model = Post
        fields = [
            "id",
            "author",
            "title",
            "content",
            "slug",
            "status",
            "meta_description",
            "created_at",
            "updated_at",
            "published_at",
            "is_published",
            "is_featured",
            "categories",
            "view_count",
            "like_count",
            "comment_count",
            "reading_time"
        ]

        read_only_fields = [
        "id",
        "author",
        "created_at",
        "updated_at",
        "slug"
        "view_count",
        "like_count",
        "comment_count",
        "reading_time"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request:
            self.fields['categories'].queryset = Category.objects.filter(user=request.user)

    def validate_categories(self, value):
        request = self.context.get('request')
        if request:
            for category in value:
                if category.user != request.user:
                    raise serializers.ValidationError("You can only select one of your categories")
        return value

    def create(self, validated_data):
        categories = validated_data.pop('categories', [])
        post = Post.objects.create(**validated_data)
        post.categories.set(categories)
        return post

    def update(self, instance, validated_data):
        categories = validated_data.pop('categories', [])
        for attr, val in validated_data.items():
            setattr(instance, attr,val)
        if categories is not None:
            instance.categories.set(categories)
        instance.save()
        return instance

class CategorySerializer(serializers.ModelSerializer):
    user = serializers.HiddenField(default=serializers.CurrentUserDefault())

    class Meta:
        model = Category
        fields = [
            "id",
            "user",
            "name",
            "slug",
            "created_at"
        ]
        read_only_fields = ["id", "created_at", "slug"]

    def create(self, validated_data):
        if 'user' not in validated_data and self.context.get('request'):
            validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop('user', None)
        for attr, val in validated_data.items():
            setattr(instance, attr,val)
        instance.save()
        return instance

class CommentSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    class Meta:
        model = Comment
        fields = [
            'id',
            'post',
            'user',
            'content',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id','post','created_at', 'updated_at']

    def validate_content(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Comment content cannot be empty")
        return value

    def create(self, validated_data):
        view = self.context.get('view')

        if view:
            post_kwarg = view.kwargs.get('post_pk') or view.kwargs.get('pk')
            if post_kwarg and 'post' not in validated_data:
                validated_data['post'] = get_object_or_404(Post, pk=post_kwarg)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop('user', None)
        validated_data.pop('post', None)
        for attr, val in validated_data.items():
            setattr(instance, attr,val)
        instance.save()
        return instance
