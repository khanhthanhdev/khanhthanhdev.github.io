module Jekyll
  module ImageSizeFilter
    # Class-level cache for image dimensions to keep build times fast
    @@cache = {}

    def image_size(path)
      return [nil, nil] if path.nil? || path.strip.empty?

      site = @context.registers[:site]
      # Clean path and prepend site source directory
      clean_path = path.strip.sub(/^\//, '')
      full_path = File.join(site.source, clean_path)

      return @@cache[full_path] if @@cache.key?(full_path)

      if File.exist?(full_path) && !File.directory?(full_path)
        begin
          # Handle SVG parsing manually to avoid missing ImageMagick delegates inside Docker
          if File.extname(full_path).downcase == '.svg'
            svg_content = File.read(full_path)
            width = nil
            height = nil

            # 1. Look for explicit width and height attributes in root svg tag
            if svg_content =~ /<svg[^>]*\bwidth=["'](\d+(?:\.\d+)?)p?x?%?["']/i
              width = $1.to_f.round
            end
            if svg_content =~ /<svg[^>]*\bheight=["'](\d+(?:\.\d+)?)p?x?%?["']/i
              height = $1.to_f.round
            end

            # 2. Fall back to viewBox parsing if width/height are not set or are 0
            if (width.nil? || height.nil? || width == 0 || height == 0) && svg_content =~ /<svg[^>]*\bviewBox=["']([^"']+)["']/i
              viewbox_parts = $1.strip.split(/[\s,]+/)
              if viewbox_parts.length == 4
                width = viewbox_parts[2].to_f.round
                height = viewbox_parts[3].to_f.round
              end
            end

            if width && height && width > 0 && height > 0
              dimensions = [width, height]
              @@cache[full_path] = dimensions
              return dimensions
            end
          end

          # For PNG, JPEG, WEBP, GIF, etc., use standard identify command
          output = `identify -format "%w %h" "#{full_path}" 2>/dev/null`.strip
          parts = output.split
          if parts.length == 2
            dimensions = [parts[0].to_i, parts[1].to_i]
            @@cache[full_path] = dimensions
            return dimensions
          end
        rescue => e
          Jekyll.logger.warn "ImageSizeFilter:", "Could not get size for #{path}: #{e.message}"
        end
      end

      # Cache the nil results too to avoid running identify repeatedly for missing files
      @@cache[full_path] = [nil, nil]
      [nil, nil]
    end
  end
end

Liquid::Template.register_filter(Jekyll::ImageSizeFilter)
