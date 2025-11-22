import prisma from "../../db";

const cleanupBlacklistedTokens = async (): Promise<void> => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const result = await prisma.blacklistedTokens.deleteMany({
      where: {
        listedAt: {
          lt: thirtyDaysAgo,
        },
      },
    });
    if (result.count === 0) {
      console.log("No Blacklisted tokens were older than 30 days");
    } else {
      console.log(`Cleaned up ${result.count} blacklisted refresh token`);
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("Error cleaning blacklisted tokens: ", err.message);
    } else {
      console.error("Unexpected error:", err);
    }
  }
};

export default cleanupBlacklistedTokens;
