import AboutUs from "@/components/AboutUs";
import ContactUs from "@/components/ContactUs";
import Events from "@/components/Events";
import Hero from "@/components/Hero";

export default function HomePage() {
  return (
    <>
      {/* FULL-WIDTH HERO */}
      <section id="hero" className="landing-hero">
        <Hero />
      </section>

      {/* REST OF PAGE */}
      <main className="landing-container">
        <section id="about">
          <AboutUs />
        </section>

        <section id="events">
          <Events />
        </section>

        <section id="contact">
          <ContactUs />
        </section>
      </main>
    </>
  );
}
