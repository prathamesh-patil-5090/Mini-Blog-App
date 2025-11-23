from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from authentication.models import User
from posts.models import Category, Comment, Like, Post
from posts.serializers import CategorySerializer, CommentSerializer, PostSerializer
from posts.views import CommentView, PostView


class BaseAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="testuser",
            email="testuser@test.com",
            password="testPass@1",
            first_name="Test",
            last_name="User",
        )
        self.other_user = User.objects.create_user(
            username="otheruser",
            email="otheruser@test.com",
            password="testPass@1",
            first_name="Other",
            last_name="User",
        )
        self.client.force_authenticate(user=self.user)


class PostSerializerTestCase(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.category1 = Category.objects.create(user=self.user, name="Cat 1")
        self.category2 = Category.objects.create(user=self.user, name="Cat 2")
        self.other_category = Category.objects.create(user=self.other_user, name="Other Cat")

    def test_create_post_serializer_by_user(self):
        """
        Existing test, adjusted to use serializer context correctly.
        """
        data = {
            "title": "My first post",
            "content": "Hello world",
            "slug": "first-post",
            "status": "draft",
            "meta_description": "short desc",
            "is_published": False,
            "is_featured": False,
            "categories": [self.category1.id, self.category2.id],
        }

        factory = APIRequestFactory()
        request = factory.post("/fake-url/")
        request.user = self.user

        serializer = PostSerializer(
            data=data,
            context={"request": request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        post = serializer.save(author=self.user)

        self.assertEqual(post.title, data["title"])
        self.assertEqual(post.content, data["content"])
        # slug is read-only on the serializer; it should be auto-generated from the title
        from django.utils.text import slugify
        self.assertEqual(post.slug, slugify(data["title"]))
        self.assertEqual(post.meta_description, data["meta_description"])
        self.assertEqual(set(post.categories.all()), {self.category1, self.category2})

    def test_post_serializer_categories_queryset_scoped_to_user(self):
        factory = APIRequestFactory()
        request = factory.get("/fake-url/")
        request.user = self.user

        serializer = PostSerializer(context={"request": request})
        qs = serializer.fields["categories"].queryset
        self.assertIn(self.category1, qs)
        self.assertIn(self.category2, qs)
        self.assertNotIn(self.other_category, qs)

    def test_post_serializer_validate_categories_rejects_foreign_category(self):
        factory = APIRequestFactory()
        request = factory.post("/fake-url/")
        request.user = self.user

        data = {
            "title": "Post with foreign category",
            "content": "Content",
            "slug": "foreign-cat",
            "status": "draft",
            "meta_description": "desc",
            "is_published": False,
            "is_featured": False,
            "categories": [self.category1.id, self.other_category.id],
        }

        serializer = PostSerializer(
            data=data,
            context={"request": request},
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("categories", serializer.errors)

    def test_post_serializer_update_categories(self):
        post = Post.objects.create(
            author=self.user,
            title="Old title",
            content="Old content",
            slug="old-slug",
            status="draft",
            meta_description="old desc",
        )
        post.categories.add(self.category1)

        data = {
            "title": "New title",
            "content": "New content",
            "meta_description": "new desc",
            "categories": [self.category2.id],
        }

        serializer = PostSerializer(instance=post, data=data, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated_post = serializer.save()

        self.assertEqual(updated_post.title, "New title")
        self.assertEqual(updated_post.content, "New content")
        self.assertEqual(updated_post.meta_description, "new desc")
        self.assertEqual(list(updated_post.categories.all()), [self.category2])


class CategorySerializerTestCase(BaseAPITestCase):
    def test_category_serializer_create_sets_user_from_context(self):
        factory = APIRequestFactory()
        request = factory.post("/fake-url/")
        request.user = self.user

        data = {"name": "Tech"}
        serializer = CategorySerializer(data=data, context={"request": request})
        self.assertTrue(serializer.is_valid(), serializer.errors)

        category = serializer.save()
        self.assertEqual(category.user, self.user)
        self.assertEqual(category.name, "Tech")
        self.assertIsNotNone(category.slug)

    def test_category_serializer_update_does_not_allow_user_change(self):
        category = Category.objects.create(user=self.user, name="Original")
        data = {
            "name": "Updated",
            "user": self.other_user,  # Should be ignored
        }

        serializer = CategorySerializer(instance=category, data=data, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()

        self.assertEqual(updated.name, "Updated")
        self.assertEqual(updated.user, self.user)


class CommentSerializerTestCase(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.post = Post.objects.create(
            author=self.user,
            title="Post",
            content="Content",
            slug="post-slug",
            status="draft",
            meta_description="desc",
        )

    def test_comment_serializer_validate_content_non_empty(self):
        serializer = CommentSerializer(data={"content": "  "})
        self.assertFalse(serializer.is_valid())
        self.assertIn("content", serializer.errors)

    def test_comment_serializer_create_uses_view_kwarg_post_pk(self):
        factory = APIRequestFactory()
        request = factory.post("/posts/1/comments/")
        request.user = self.user

        view = CommentView()
        view.request = request
        view.kwargs = {"post_pk": self.post.pk}

        serializer = CommentSerializer(
            data={"content": "Nice post"},
            context={"request": request, "view": view},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        comment = serializer.save(user=self.user)

        self.assertEqual(comment.post, self.post)
        self.assertEqual(comment.user, self.user)
        self.assertEqual(comment.content, "Nice post")

    def test_comment_serializer_create_uses_view_kwarg_pk(self):
        factory = APIRequestFactory()
        request = factory.post("/posts/1/comments/")
        request.user = self.user

        view = CommentView()
        view.request = request
        view.kwargs = {"pk": self.post.pk}

        serializer = CommentSerializer(
            data={"content": "Another comment"},
            context={"request": request, "view": view},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        comment = serializer.save(user=self.user)

        self.assertEqual(comment.post, self.post)
        self.assertEqual(comment.content, "Another comment")

    def test_comment_serializer_update_ignores_user_and_post(self):
        comment = Comment.objects.create(
            post=self.post,
            user=self.user,
            content="Old content",
        )

        serializer = CommentSerializer(
            instance=comment,
            data={
                "content": "Updated content",
                "user": self.other_user,
                "post": None,
            },
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()

        self.assertEqual(updated.content, "Updated content")
        self.assertEqual(updated.user, self.user)
        self.assertEqual(updated.post, self.post)


class PostViewTestCase(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.list_create_url = "/posts/"  # direct URL path; adjust if your urls.py differs

        self.post1 = Post.objects.create(
            author=self.user,
            title="User post 1",
            content="Content 1",
            slug="user-post-1",
            status="draft",
            meta_description="desc1",
        )
        self.post2 = Post.objects.create(
            author=self.user,
            title="User post 2",
            content="Content 2",
            slug="user-post-2",
            status="draft",
            meta_description="desc2",
        )
        self.other_post = Post.objects.create(
            author=self.other_user,
            title="Other user post",
            content="Other content",
            slug="other-post",
            status="draft",
            meta_description="other desc",
        )

    def test_post_list_returns_only_authenticated_user_posts(self):
        response = self.client.get(self.list_create_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["results"]]
        self.assertIn(self.post1.id, ids)
        self.assertIn(self.post2.id, ids)
        self.assertNotIn(self.other_post.id, ids)

    def test_post_create_sets_author_to_request_user(self):
        data = {
            "title": "Created by view",
            "content": "Some content",
            "slug": "created-by-view",
            "status": "draft",
            "meta_description": "desc",
            "is_published": False,
            "is_featured": False,
            "categories": [],
        }

        response = self.client.post(self.list_create_url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        post_id = response.data["id"]
        post = Post.objects.get(id=post_id)
        self.assertEqual(post.author, self.user)


class PostDetailViewTestCase(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.user_post = Post.objects.create(
            author=self.user,
            title="User post",
            content="User content",
            slug="user-detail-post",
            status="draft",
            meta_description="desc",
        )
        self.other_post = Post.objects.create(
            author=self.other_user,
            title="Other post",
            content="Other content",
            slug="other-detail-post",
            status="draft",
            meta_description="desc",
        )

    def test_retrieve_own_post(self):
        url = f"/posts/{self.user_post.pk}/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.user_post.id)

    def test_cannot_retrieve_other_user_post(self):
        url = f"/posts/{self.other_post.pk}/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_own_post(self):
        url = f"/posts/{self.user_post.pk}/"
        response = self.client.patch(
            url, {"title": "Updated title"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user_post.refresh_from_db()
        self.assertEqual(self.user_post.title, "Updated title")

    def test_delete_own_post(self):
        url = f"/posts/{self.user_post.pk}/"
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Post.objects.filter(pk=self.user_post.pk).exists())


class CommentViewTestCase(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.post1 = Post.objects.create(
            author=self.user,
            title="Post 1",
            content="Content 1",
            slug="post-1",
            status="draft",
            meta_description="desc1",
        )
        self.post2 = Post.objects.create(
            author=self.user,
            title="Post 2",
            content="Content 2",
            slug="post-2",
            status="draft",
            meta_description="desc2",
        )
        self.comment1 = Comment.objects.create(
            post=self.post1, user=self.user, content="Comment 1"
        )
        self.comment2 = Comment.objects.create(
            post=self.post2, user=self.user, content="Comment 2"
        )
        self.other_comment = Comment.objects.create(
            post=self.post1, user=self.other_user, content="Other user comment"
        )

    def test_list_comments_for_all_posts_of_user(self):
        url = "/comments/"  # list all comments for authenticated user
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["results"]]
        self.assertIn(self.comment1.id, ids)
        self.assertIn(self.comment2.id, ids)
        self.assertNotIn(self.other_comment.id, ids)

    def test_list_comments_for_specific_post(self):
        url = f"/posts/{self.post1.pk}/comments/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["results"]]
        self.assertIn(self.comment1.id, ids)
        self.assertNotIn(self.comment2.id, ids)
        self.assertNotIn(self.other_comment.id, ids)

    def test_create_comment_sets_user(self):
        url = f"/posts/{self.post1.pk}/comments/"
        response = self.client.post(
            url, {"content": "New comment"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        comment = Comment.objects.get(id=response.data["id"])
        self.assertEqual(comment.user, self.user)
        self.assertEqual(comment.post, self.post1)
        self.assertEqual(comment.content, "New comment")


class CommentDetailViewTestCase(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.post = Post.objects.create(
            author=self.user,
            title="Post",
            content="Content",
            slug="post-comments",
            status="draft",
            meta_description="desc",
        )
        self.comment = Comment.objects.create(
            post=self.post,
            user=self.user,
            content="My comment",
        )
        self.other_comment = Comment.objects.create(
            post=self.post,
            user=self.other_user,
            content="Other comment",
        )

    def _detail_url(self, comment):
        # assuming nested URL /posts/<post_pk>/comments/<pk>/
        return f"/posts/{self.post.pk}/comments/{comment.pk}/"

    def test_retrieve_own_comment_within_post(self):
        url = self._detail_url(self.comment)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.comment.id)

    def test_cannot_retrieve_other_user_comment(self):
        url = self._detail_url(self.other_comment)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_own_comment(self):
        url = self._detail_url(self.comment)
        response = self.client.patch(
            url, {"content": "Updated comment"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.comment.refresh_from_db()
        self.assertEqual(self.comment.content, "Updated comment")

    def test_delete_own_comment(self):
        url = self._detail_url(self.comment)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Comment.objects.filter(pk=self.comment.pk).exists())


class LikeToggleViewTestCase(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.post = Post.objects.create(
            author=self.user,
            title="Likeable post",
            content="Content",
            slug="likeable-post",
            status="draft",
            meta_description="desc",
        )
        self.url = f"/posts/{self.post.pk}/like-toggle/"

    def test_like_toggle_creates_like(self):
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Like.objects.filter(post=self.post, user=self.user).exists())
        self.assertEqual(response.data["liked"], True)

    def test_like_toggle_returns_200_if_like_already_exists(self):
        Like.objects.create(post=self.post, user=self.user)
        response = self.client.post(self.url)
        # could be 200 from normal path or 200 from IntegrityError
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["liked"], True)
        self.assertEqual(
            Like.objects.filter(post=self.post, user=self.user).count(),
            1,
        )

    def test_unlike_removes_like(self):
        Like.objects.create(post=self.post, user=self.user)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Like.objects.filter(post=self.post, user=self.user).exists())
