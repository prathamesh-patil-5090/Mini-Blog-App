


from django.urls import path

from posts.views import (
    CommentDetailView,
    CommentView,
    LikeToggleView,
    PostDetailView,
    PostView,
)

urlpatterns=[
    path("", PostView.as_view(), name="get-and-create-all-task"),
    path("<int:pk>/", PostDetailView.as_view(), name="operations-for-post-by-id"),
    path("<int:pk>/comments/", CommentView.as_view(), name="get-and-create-comments-for-post"),
    path("<int:post_pk>/comments/<int:pk>/", CommentDetailView.as_view(), name="comment-detail"),
    path("<int:pk>/like/", LikeToggleView.as_view(), name="post-like-toggle")
]
