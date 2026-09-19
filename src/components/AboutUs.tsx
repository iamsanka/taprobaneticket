"use client";

import "./AboutUs.css";

export default function AboutUs() {
  return (
    <section className="about-section">

      {/* WHO WE ARE */}
      <div className="about-block">
        <div className="about-text">
          <div className="about-title">Who We Are</div>
          <p className="about-description">
            Taprobane Entertainment is a dynamic, multicultural creative company that fuses 
            the vibrant spirit of Sri Lanka with the refined elegance of Finland. We craft 
            unforgettable experiences through events, artistic productions, and cultural 
            initiatives that connect people and celebrate diversity across Europe.
          </p>
        </div>

        <div className="about-image">
          <img src="/images/aboutus/image1.gif" alt="Who We Are" />
        </div>
      </div>

      {/* OUR MISSION */}
      <div className="about-block reverse">
        <div className="about-text">
          <div className="about-title">Our Mission</div>
          <p className="about-description">
            Our mission is to build meaningful bridges between cultures, celebrate the richness 
            of diversity, and craft experiences that deeply resonate with audiences across Europe. 
            Through events, artistic productions, and cultural initiatives, we aim to inspire 
            connection, foster understanding, and create moments that leave a lasting impression 
            on everyone we reach.
          </p>
        </div>

        <div className="about-image">
          <img src="/images/aboutus/image2.gif" alt="Our Mission" />
        </div>
      </div>

      {/* OUR VISION */}
      <div className="about-block">
        <div className="about-text">
          <div className="about-title">Our Vision</div>
          <p className="about-description">
            Our vision is to become Europe’s leading multicultural entertainment brand, celebrated 
            for delivering innovative events, showcasing artistic excellence, and telling authentic 
            cultural stories that connect and inspire audiences across the continent.
          </p>
        </div>

        <div className="about-image">
          <img src="/images/aboutus/image3.gif" alt="Our Vision" />
        </div>
      </div>

    </section>
  );
}
