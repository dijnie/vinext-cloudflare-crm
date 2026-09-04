import { buttonVariants } from "@/components/ui/button";
import { Github, LayoutDashboard } from "lucide-react";

const repoLink =
  "https://github.com/cloudflare/templates/tree/main/saas-admin-template";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 px-8">
      <h1 className="text-5xl font-bold">SaaS Admin Template</h1>
      <p className="text-xl text-muted-foreground">
        Manage a SaaS application - customers, subscriptions - using Cloudflare
        Workers and D1.
      </p>
      <div className="flex flex gap-4 mt-4">
        <a className={buttonVariants()} href="/admin">
          <LayoutDashboard /> Go to admin
        </a>
        <a className={buttonVariants({ variant: "outline" })} href={repoLink}>
          <Github /> View on GitHub
        </a>
      </div>
    </div>
  );
}
