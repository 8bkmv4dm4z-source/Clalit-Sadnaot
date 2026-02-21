import {
  CalendarClock,
  CalendarDays,
  LayoutGrid,
  LogIn,
  Settings,
  Shield,
  User,
  UserPlus,
  Users,
} from "lucide-react";

export const NAV_LINKS = {
  workshops: { key: "workshops", label: "כל הסדנאות", path: "/workshops", icon: LayoutGrid },
  workshopsCalendar: {
    key: "workshopsCalendar",
    label: "יומן הסדנאות",
    path: "/workshops-calendar",
    icon: CalendarClock,
  },
  myWorkshops: {
    key: "myWorkshops",
    label: "הסדנאות שלי",
    path: "/myworkshops",
    icon: CalendarDays,
  },
  myProfile: { key: "myProfile", label: "הפרופיל שלי", path: "/profile", icon: User },
  login: { key: "login", label: "התחברות", path: "/login", icon: LogIn },
  register: { key: "register", label: "הרשמה", path: "/register", icon: UserPlus },
  newWorkshop: { key: "newWorkshop", label: "סדנה חדשה", path: "/editworkshop", icon: Settings },
  adminHub: { key: "adminHub", label: "Admin Hub", path: "/admin/hub", icon: Shield },
  users: { key: "users", label: "ניהול משתמשים", path: "/profiles", icon: Users },
};

export const getPublicNavItems = () => [NAV_LINKS.workshops, NAV_LINKS.login, NAV_LINKS.register];

export const getAuthenticatedNavItems = ({ canAccessAdmin = false, isChecking = true } = {}) => {
  const items = [
    NAV_LINKS.workshops,
    NAV_LINKS.workshopsCalendar,
    NAV_LINKS.myWorkshops,
    NAV_LINKS.myProfile,
  ];

  if (canAccessAdmin && !isChecking) {
    items.push(NAV_LINKS.newWorkshop, NAV_LINKS.adminHub, NAV_LINKS.users);
  }

  return items;
};
