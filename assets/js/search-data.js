// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-about",
    title: "about",
    section: "Navigation",
    handler: () => {
      window.location.href = "/";
    },
  },{id: "nav-blog",
          title: "blog",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/blog/";
          },
        },{id: "nav-publications-and-pre-prints",
          title: "publications and pre-prints",
          description: "publications by categories in reversed chronological order. *,^ denotes equal author contribution.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/publications/";
          },
        },{id: "nav-projects",
          title: "projects",
          description: "Projects by Tran Khanh Thanh (khanhthanhdev) in AI agents, robotics, and full-stack systems.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/projects/";
          },
        },{id: "nav-repositories",
          title: "repositories",
          description: "Edit the `_data/repositories.yml` and change the `github_users` and `github_repos` lists to include your own GitHub profile and repositories.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/repositories/";
          },
        },{id: "nav-cv",
          title: "CV",
          description: "Curriculum vitae of Tran Khanh Thanh (Trần Khánh Thành / khanhthanhdev), Electrical and Computer Engineering student at VinUniversity.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/cv/";
          },
        },{id: "nav-academics",
          title: "academics",
          description: "Education, coursework, and academic achievements.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/academics/";
          },
        },{id: "nav-teaching",
          title: "teaching",
          description: "Course materials, schedules, and resources for classes taught.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/teaching/";
          },
        },{id: "nav-people",
          title: "people",
          description: "members of the lab or group",
          section: "Navigation",
          handler: () => {
            window.location.href = "/people/";
          },
        },{id: "dropdown-bookshelf",
              title: "bookshelf",
              description: "",
              section: "Dropdown",
              handler: () => {
                window.location.href = "/books/";
              },
            },{id: "dropdown-blog",
              title: "blog",
              description: "",
              section: "Dropdown",
              handler: () => {
                window.location.href = "/blog/";
              },
            },{id: "post-linear-regression-amp-normal-equation",
        
          title: "Linear Regression &amp; Normal Equation",
        
        description: "Interactive visualization and derivation comparing the Normal Equation and Gradient Descent for Linear Regression.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/interactive-gradient-descent/";
          
        },
      },{id: "post-third-party-libraries-demo",
        
          title: "Third-Party Libraries Demo",
        
        description: "A comprehensive demo of every third-party library available in this al-folio site",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/third-party-libraries-demo/";
          
        },
      },{id: "post-how-to-write-a-blog-post",
        
          title: "how to write a blog post",
        
        description: "a comprehensive guide to writing blog posts on this site",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/how-to-write-blog/";
          
        },
      },{id: "post-test-sidebar-table-of-contents",
        
          title: "test sidebar table of contents",
        
        description: "testing the new sidebar TOC feature",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/blog/2026/test-sidebar-toc/";
          
        },
      },{id: "books-the-godfather",
          title: 'The Godfather',
          description: "",
          section: "Books",handler: () => {
              window.location.href = "/books/the_godfather/";
            },},{id: "news-a-simple-inline-announcement",
          title: 'A simple inline announcement.',
          description: "",
          section: "News",},{id: "news-a-long-announcement-with-details",
          title: 'A long announcement with details',
          description: "",
          section: "News",handler: () => {
              window.location.href = "/news/announcement_2/";
            },},{id: "news-a-simple-inline-announcement-with-markdown-emoji-sparkles-smile",
          title: 'A simple inline announcement with Markdown emoji! :sparkles: :smile:',
          description: "",
          section: "News",},{id: "projects-chess-engine",
          title: 'Chess Engine',
          description: "A basic chess engine with minimax and alpha-beta pruning.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/chess-engine/";
            },},{id: "projects-stemfun-project-architecture-and-workflow",
          title: 'StemFun Project Architecture and Workflow',
          description: "Detailed project workflow for StemFun: classic generation, render repair, queue management, and multi-agent Studio sessions.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/stemfun/";
            },},{id: "projects-rust-cli-tool",
          title: 'Rust CLI Tool',
          description: "A fast command-line file organizer written in Rust.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/rust-cli/";
            },},{id: "projects-ml-training-pipeline",
          title: 'ML Training Pipeline',
          description: "End-to-end machine learning pipeline for image classification using PyTorch and MLflow.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/ml-pipeline/";
            },},{id: "projects-personal-portfolio-website",
          title: 'Personal Portfolio Website',
          description: "A Jekyll-based academic portfolio site with blog, publications, and project pages.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/portfolio-site/";
            },},{id: "projects-infi-trustworthy-ai-financial-research",
          title: 'Infi: Trustworthy AI Financial Research',
          description: "Building Infi: A local-first desktop app forcing AI agents to produce source-backed, structured investment reports.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/infi/";
            },},{id: "projects-ai-knowledge-cloud-directory-amp-semantic-search",
          title: 'AI Knowledge Cloud: Directory &amp;amp; Semantic Search',
          description: "How I built a full-stack AI tool directory with hybrid vector search, conversational AI, and automated content pipelines using Next.js, Qdrant, and Inngest.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/2026-06-02-ai-knowledge-cloud/";
            },},{id: "teachings-data-science-fundamentals",
          title: 'Data Science Fundamentals',
          description: "Foundations of data science: collection, cleaning, analysis, and visualization with practical real-world datasets.",
          section: "Teachings",handler: () => {
              window.location.href = "/teachings/data-science-fundamentals/";
            },},{id: "teachings-introduction-to-machine-learning",
          title: 'Introduction to Machine Learning',
          description: "Introduction to machine learning concepts, algorithms, supervised/unsupervised learning, and practical models.",
          section: "Teachings",handler: () => {
              window.location.href = "/teachings/introduction-to-machine-learning/";
            },},{
        id: 'social-email',
        title: 'email',
        section: 'Socials',
        handler: () => {
          window.open("mailto:%74%68%61%6E%68%6B%74%32%37%35%30%37@%67%6D%61%69%6C.%63%6F%6D", "_blank");
        },
      },{
        id: 'social-github',
        title: 'GitHub',
        section: 'Socials',
        handler: () => {
          window.open("https://github.com/khanhthanhdev", "_blank");
        },
      },{
        id: 'social-scholar',
        title: 'Google Scholar',
        section: 'Socials',
        handler: () => {
          window.open("https://scholar.google.com/citations?user=n6rJ1zMAAAA", "_blank");
        },
      },{
        id: 'social-linkedin',
        title: 'LinkedIn',
        section: 'Socials',
        handler: () => {
          window.open("https://www.linkedin.com/in/khanhthanhdev", "_blank");
        },
      },{
        id: 'social-x',
        title: 'X',
        section: 'Socials',
        handler: () => {
          window.open("https://twitter.com/Kevintr275", "_blank");
        },
      },{
      id: 'light-theme',
      title: 'Change theme to light',
      description: 'Change the theme of the site to Light',
      section: 'Theme',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: 'Change theme to dark',
      description: 'Change the theme of the site to Dark',
      section: 'Theme',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: 'Use system default theme',
      description: 'Change the theme of the site to System Default',
      section: 'Theme',
      handler: () => {
        setThemeSetting("system");
      },
    },];
