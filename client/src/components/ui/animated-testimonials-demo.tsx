import { AnimatedTestimonials } from "@/components/ui/animated-testimonials";

export function AnimatedTestimonialsDemo() {
  const testimonials = [
    {
      quote:
        "האווירה בסדנאות מצוינת וההדרכה ברמה גבוהה. קל להתמיד כשיש מסגרת כזו.",
      name: "דנה כהן",
      designation: "משתתפת קבועה",
      src: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=3560&auto=format&fit=crop",
    },
    {
      quote:
        "עברנו לניהול הרשמות מסודר והצוות רואה בזמן אמת מה מתמלא ומה דורש תגבור.",
      name: "אור לוי",
      designation: "רכז תכניות",
      src: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=3540&auto=format&fit=crop",
    },
    {
      quote:
        "ממשק ברור ונוח גם במובייל. המשתתפים מבינים מהר מה מתאים להם ונרשמים בקלות.",
      name: "מיכל רוזן",
      designation: "מנהלת קהילה",
      src: "https://images.unsplash.com/photo-1623582854588-d60de57fa33f?q=80&w=3540&auto=format&fit=crop",
    },
  ];

  return <AnimatedTestimonials testimonials={testimonials} autoplay />;
}
