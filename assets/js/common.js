$(document).ready(function () {
  // add toggle functionality to abstract, award and bibtex buttons
  $("a.abstract").click(function () {
    $(this).parent().parent().find(".abstract.hidden").toggleClass("open");
    $(this).parent().parent().find(".award.hidden.open").toggleClass("open");
    $(this).parent().parent().find(".bibtex.hidden.open").toggleClass("open");
  });
  $("a.award").click(function () {
    $(this).parent().parent().find(".abstract.hidden.open").toggleClass("open");
    $(this).parent().parent().find(".award.hidden").toggleClass("open");
    $(this).parent().parent().find(".bibtex.hidden.open").toggleClass("open");
  });
  $("a.bibtex").click(function () {
    $(this).parent().parent().find(".abstract.hidden.open").toggleClass("open");
    $(this).parent().parent().find(".award.hidden.open").toggleClass("open");
    $(this).parent().parent().find(".bibtex.hidden").toggleClass("open");
  });
  $("a").removeClass("waves-effect waves-light");

  // bootstrap-toc
  if ($("#toc-sidebar-nav").length) {
    // remove related publications years from the TOC
    $(".publications h2").each(function () {
      $(this).attr("data-toc-skip", "");
    });
    var navSelector = "#toc-sidebar-nav";
    var $myNav = $(navSelector);
    Toc.init($myNav);
    // Keep the generated TOC tree expanded instead of only showing the
    // currently active branch.
    $myNav.find("ul").removeClass("collapse collapsing").show();
    $("body").scrollspy({
      target: navSelector,
      offset: 100,
    });

    // Close/open sidebar functionality
    var $sidebar = $("#toc-sidebar");
    var $closeBtn = $("#close-sidebar-btn");
    var $openBtn = $("#open-sidebar-btn");

    $closeBtn.on("click", function () {
      $sidebar.addClass("toc-sidebar-hidden");
      if (window.innerWidth > 991) {
        $openBtn.show();
      }
    });

    $openBtn.on("click", function () {
      $sidebar.removeClass("toc-sidebar-hidden");
      $openBtn.hide();
    });

    // Handle responsive behavior
    function handleResize() {
      // Show the TOC by default at every breakpoint; users can still collapse
      // it manually with the header chevron.
      $sidebar.removeClass("toc-sidebar-hidden");
      $openBtn.hide();
    }

    // Run on page load and window resize
    handleResize();
    $(window).on("resize", handleResize);
  }

  // add css to jupyter notebooks
  const cssLink = document.createElement("link");
  cssLink.href = "../css/jupyter.css";
  cssLink.rel = "stylesheet";
  cssLink.type = "text/css";

  let jupyterTheme = determineComputedTheme();

  $(".jupyter-notebook-iframe-container iframe").each(function () {
    $(this).contents().find("head").append(cssLink);

    if (jupyterTheme == "dark") {
      $(this).bind("load", function () {
        $(this).contents().find("body").attr({
          "data-jp-theme-light": "false",
          "data-jp-theme-name": "JupyterLab Dark",
        });
      });
    }
  });

  // trigger popovers
  $('[data-toggle="popover"]').popover({
    trigger: "hover",
  });
});
