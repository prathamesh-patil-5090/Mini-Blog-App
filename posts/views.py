from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import IsAuthenticated
from rest_framework.relations import QuerySet
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Comment, Like, Post, User
from .serializers import CommentSerializer, PostSerializer, SetPagination


class PostView(generics.ListCreateAPIView):
    serializer_class = PostSerializer
    pagination_class = SetPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        author = self.request.user
        if not author:
            return AuthenticationFailed("No author provided")
        queryset = Post.objects.filter(author=author)
        return queryset

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

class PostDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PostSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Post.objects.filter(author=self.request.user)
        )

class CommentView(generics.ListCreateAPIView):
    serializer_class = CommentSerializer
    pagination_class = SetPagination
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        pk = self.kwargs.get('pk')
        if pk:
            return Comment.objects.filter(post__pk=pk, user=self.request.user).order_by('-created_at')
        return Comment.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class CommentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CommentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        post_pk = self.kwargs.get('post_pk')
        return Comment.objects.filter(post__pk=post_pk, user=self.request.user)

class LikeToggleView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        try:
            with transaction.atomic():
                like, created = Like.objects.get_or_create(post=post, user=request.user)
        except IntegrityError:
            return Response({'liked': True}, status=status.HTTP_200_OK)

        if created:
            return Response({'liked': True}, status=status.HTTP_201_CREATED)

        return Response({'liked': True}, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        Like.objects.filter(post=post, user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
