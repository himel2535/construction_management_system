import { redirect } from "next/navigation";

export default function ClientCreatePage() {
  redirect("/customers/new");
}
