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
          description: "A growing collection of your cool projects.",
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
          description: "",
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
            },},{id: "projects-building-infi-how-we-solved-the-trust-problem-in-ai-powered-financial-research",
          title: 'Building Infi: How We Solved the Trust Problem in AI-Powered Financial Research',
          description: "The story of building Infi - a local-first desktop app that forces AI agents to produce source-backed, structured investment reports. What broke, what we learned, and why MCP changed everything.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/infi/";
            },},{id: "teachings-data-science-fundamentals",
          title: 'Data Science Fundamentals',
          description: "This course covers the foundational aspects of data science, including data collection, cleaning, analysis, and visualization. Students will learn practical skills for working with real-world datasets.",
          section: "Teachings",handler: () => {
              window.location.href = "/teachings/data-science-fundamentals/";
            },},{id: "teachings-introduction-to-machine-learning",
          title: 'Introduction to Machine Learning',
          description: "This course provides an introduction to machine learning concepts, algorithms, and applications. Students will learn about supervised and unsupervised learning, model evaluation, and practical implementations.",
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
      },];
