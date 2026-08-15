import { useEffect } from "react";

export function AdminSeo() {
  useEffect(() => {
    document.title = "WeMilktea Admin";
    let robots = document.head.querySelector<HTMLMetaElement>(
      'meta[name="robots"]'
    );
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.append(robots);
    }
    robots.content = "noindex, nofollow, noarchive, nosnippet";
  }, []);

  return null;
}
