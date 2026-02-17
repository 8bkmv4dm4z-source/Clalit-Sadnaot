import { Briefcase, FileText, Home, User } from "lucide-react";
import { NavBar } from "@/components/ui/tubelight-navbar";

export function NavBarDemo() {
  const navItems = [
    { name: "Home", url: "/", icon: Home },
    { name: "About", url: "/about", icon: User },
    { name: "Projects", url: "/projects", icon: Briefcase },
    { name: "Resume", url: "/resume", icon: FileText },
  ];

  return <NavBar items={navItems} />;
}

