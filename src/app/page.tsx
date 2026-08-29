import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/data/session";

export default async function RootPage() {
  const user = await getSessionUser();

  redirect(user ? "/home" : "/login");
}
