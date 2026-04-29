import prisma from "../../db"
import { hashPassword } from "./password"

const normalizeSlug = (raw: string): string =>
  raw
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

async function main() {
  console.log("Seeding database with dummy data...")

  // Clear existing data (order matters for relations)
  await prisma.blacklistedTokens.deleteMany()
  await prisma.suspiciousActivity.deleteMany()
  await prisma.tokenFamily.deleteMany()
  await prisma.like.deleteMany()
  await prisma.comment.deleteMany()
  await prisma.post.deleteMany()
  await prisma.author.deleteMany()

  // Create authors
  const passwordHash = await hashPassword("StrongPass!123")

  const alice = await prisma.author.create({
    data: {
      name: "Alice Example",
      username: "alice",
      email: "alice@example.com",
      password: passwordHash,
    },
  })

  const bob = await prisma.author.create({
    data: {
      name: "Bob Example",
      username: "bob",
      email: "bob@example.com",
      password: passwordHash,
    },
  })

  // Create posts for each author
  const posts = [] as Array<any>

  const post1 = await prisma.post.create({
    data: {
      authorId: alice.id,
      title: "Hello World",
      content: "This is Alice's first post.",
      slug: `${alice.username}-${normalizeSlug("hello-world")}`,
      isPublished: true,
      status: "PUBLISHED",
    },
  })
  posts.push(post1)

  const post2 = await prisma.post.create({
    data: {
      authorId: alice.id,
      title: "Second Post",
      content: "More content from Alice.",
      slug: `${alice.username}-${normalizeSlug("second post")}`,
      isPublished: true,
      status: "PUBLISHED",
    },
  })
  posts.push(post2)

  const post3 = await prisma.post.create({
    data: {
      authorId: bob.id,
      title: "Bob's Thoughts",
      content: "Bob writes something interesting.",
      slug: `${bob.username}-${normalizeSlug("bobs thoughts")}`,
      isPublished: true,
      status: "PUBLISHED",
    },
  })
  posts.push(post3)

  const post4 = await prisma.post.create({
    data: {
      authorId: bob.id,
      title: "Another One",
      content: "Another post by Bob.",
      slug: `${bob.username}-${normalizeSlug("another one")}`,
      isPublished: false,
      status: "DRAFT",
    },
  })
  posts.push(post4)

  // Create comments
  await prisma.comment.create({
    data: {
      postId: post1.id,
      authorId: bob.id,
      content: "Nice post, Alice!",
    },
  })

  await prisma.comment.create({
    data: {
      postId: post3.id,
      authorId: alice.id,
      content: "Great thoughts, Bob.",
    },
  })

  // Create likes
  await prisma.like.create({
    data: {
      postId: post1.id,
      authorId: bob.id,
    },
  })

  await prisma.like.create({
    data: {
      postId: post3.id,
      authorId: alice.id,
    },
  })

  console.log("Seeding complete.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
