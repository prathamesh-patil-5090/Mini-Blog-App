
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import models
from django.urls import reverse
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _

User = get_user_model()

class PublishManager(models.Manager):
    def get_queryset(self) :
        return super().get_queryset().filter(is_published=True)


class Post(models.Model):

    class Status(models.TextChoices):
        DRAFT = 'draft', _('Draft')
        PUBLISHED = 'published', _('Published')
        ARCHIVED = 'archived', _('Archived')

    author = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name=_("Author"))
    title = models.CharField(_("Title"), max_length=255)
    content  = models.TextField(_("Content"))
    slug = models.SlugField(_("Slug"),max_length=255, help_text="SEO-friendly URL identifier")
    status = models.CharField(_("Status"),max_length=20, choices=Status.choices, default=Status.DRAFT)
    meta_description = models.CharField(_("Meta Description"), max_length=160, blank=True, help_text="Brief Description for search engines")
    created_at = models.DateTimeField(_("Created"),auto_now_add=True)
    updated_at = models.DateTimeField(_("Updated"),auto_now=True)
    published_at = models.DateTimeField(_("Published At"), null=True, blank=True)
    is_published = models.BooleanField(_("Published"),default=False)
    is_featured = models.BooleanField(_("Featured"), default=False)
    categories = models.ManyToManyField('Category', blank=True, related_name="posts")
    view_count = models.PositiveIntegerField(_("View Count"), default=0)

    objects = models.Manager()
    published = PublishManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["author", "slug"], name="unique_author_slug")
        ]

        indexes = [
            models.Index(fields=["created_at"], name="idx_posts_created_at"),
            models.Index(fields=["is_published", "-created_at"], name="idx_posts_published_at"),
            models.Index(fields=["status"], name="idx_posts_status"),
            models.Index(fields=["is_featured"], name="idx_posts_featured")
        ]
        ordering=["-created_at"]
        verbose_name = _("Post")
        verbose_name_plural = _("Posts")

    def __str__(self):
        return f"{self.title} ({self.author.username})"

    def save(self, *args, **kwargs):
       if not self.slug:
          self.slug = slugify(self.title)
       super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse('posts:detail', kwargs={'slug': self.slug})

    def clean(self):
        if self.is_published and not self.content.strip():
            raise ValidationError(_("Published posts must have content."))

    @property
    def like_count(self):
        return self.likes.count()

    @property
    def comment_count(self):
        return self.comments.count()

    @property
    def reading_time(self):
        word_count = len(self.content.split())
        return max(1, round(word_count / 200))

class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments", verbose_name=_("Post"))
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_comments", verbose_name=_("User"))
    content = models.TextField(verbose_name=_('Content'))
    created_at = models.DateTimeField(auto_now_add=True,verbose_name= _('Created'))
    updated_at = models.DateTimeField(_("Updated"), auto_now=True)

    class Meta:
        ordering = ["-created_at"]

        indexes = [
            models.Index(fields=['post','created_at'], name="idx_comments_post")
        ]
        verbose_name=_("Comment")
        verbose_name_plural = _("Comments")

    def __str__(self):
        return f"Comment by {self.user.username} on {self.post.title}"



class Like(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="likes", verbose_name=_("Post"))
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_likes", verbose_name=_("User"))
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_("Created"))

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["post", "user"], name="unique_user_like_post")
        ]

        indexes = [
            models.Index(fields=["post"], name="idx_likes_post"),
            models.Index(fields=["user"], name="idx_likes_user")
        ]
        verbose_name = _("Like")
        verbose_name_plural = _("Likes")

    def __str__(self):
        return f"{self.user.username} liked the post - {self.post.title}"

class Category(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="categories", verbose_name=_("User"))
    name = models.CharField(max_length=100, verbose_name=_("Name"))
    slug = models.SlugField(_("Slug"), max_length=100, help_text="SEO-friend category slug identifier")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_("Created"))

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'slug'], name="unique_user_category_slug")
        ]
        ordering = ["name"]
        verbose_name = _("Category")
        verbose_name_plural = _("Categories")

    def save(self, *args, **kwargs):
        if not self.slug:
           self.slug = slugify(self.name)
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    def get_absolute_url(self):
        return reverse('posts:category', kwargs={'slug': self.slug})