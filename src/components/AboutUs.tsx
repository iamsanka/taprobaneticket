"use client";

import "./AboutUs.css";

type AboutBlock = {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  tags: string[];
  image: string;
  imageAlt: string;
};

const BLOCKS: AboutBlock[] = [
  {
    index: "01",
    eyebrow: "Who We Are",
    title: "Where Sri Lanka meets Finland",
    description:
      "Taprobane Entertainment is a dynamic, multicultural creative company that fuses the vibrant spirit of Sri Lanka with the refined elegance of Finland. We craft unforgettable experiences through events, artistic productions, and cultural initiatives that connect people and celebrate diversity across Europe.",
    tags: ["Multicultural", "Creative Studio", "European Reach"],
    image: "/images/aboutus/image1.gif",
    imageAlt: "Who We Are",
  },
  {
    index: "02",
    eyebrow: "Our Mission",
    title: "Building bridges between cultures",
    description:
      "Our mission is to build meaningful bridges between cultures, celebrate the richness of diversity, and craft experiences that deeply resonate with audiences across Europe. Through events, artistic productions, and cultural initiatives, we aim to inspire connection, foster understanding, and create moments that leave a lasting impression on everyone we reach.",
    tags: ["Cultural Bridge", "Artistic Excellence", "Lasting Impact"],
    image: "/images/aboutus/image2.gif",
    imageAlt: "Our Mission",
  },
  {
    index: "03",
    eyebrow: "Our Vision",
    title: "Europe's leading multicultural brand",
    description:
      "Our vision is to become Europe's leading multicultural entertainment brand, celebrated for delivering innovative events, showcasing artistic excellence, and telling authentic cultural stories that connect and inspire audiences across the continent.",
    tags: ["Innovation", "Authenticity", "Continental Reach"],
    image: "/images/aboutus/image3.gif",
    imageAlt: "Our Vision",
  },
];

export default function AboutUs() {
  return (
    <section id="about" className="about-section">
      <div className="about-shell">
        {/* ---- Section header ---- */}
        <header className="about-header">
          <span className="about-eyebrow">About Us</span>
          <h2 className="about-heading">
            The story behind <span className="about-heading-accent">Taprobane</span>
          </h2>
          <p className="about-intro">
            A creative company shaped by two cultures, focused on one goal, 
            bringing people together through unforgettable experiences.
          </p>
        </header>

        {/* ---- Story blocks ---- */}
        <div className="about-blocks">
          {BLOCKS.map((block, i) => {
            const reversed = i % 2 === 1;
            return (
              <article
                key={block.index}
                className={`about-block ${reversed ? "reverse" : ""}`}
              >
                <div className="about-text">
                  <div className="about-meta">
                    <span className="about-index">{block.index}</span>
                    <span className="about-rule" aria-hidden="true" />
                    <span className="about-eyebrow-small">{block.eyebrow}</span>
                  </div>

                  <h3 className="about-title">{block.title}</h3>

                  <p className="about-description">{block.description}</p>

                  <ul className="about-tags">
                    {block.tags.map((tag) => (
                      <li key={tag} className="about-tag">
                        {tag}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="about-image">
                  <div className="about-image-frame">
                    <img src={block.image} alt={block.imageAlt} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}