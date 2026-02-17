import { StaggerTestimonials } from "@/components/ui/stagger-testimonials";

const DemoOne = () => {
  const items = [
    {
      tempId: 0,
      testimonial: "סדנה לדוגמה עם כרטיס תצוגה חדש.",
      by: "דוגמה, מנהל מערכת",
      imgSrc: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=500&q=80",
    },
    {
      tempId: 1,
      testimonial: "מציג מעבר בין כרטיסים בתצוגת stagger.",
      by: "דוגמה, מוביל מוצר",
      imgSrc: "https://images.unsplash.com/photo-1549068106-b024baf5062d?auto=format&fit=crop&w=500&q=80",
    },
  ];
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <StaggerTestimonials items={items} />
    </div>
  );
};

export { DemoOne };

