installed_clerk_expo = File.realpath(File.join(__dir__, "../../node_modules/@clerk/expo/ios"))
clerk_expo_candidates = Dir.glob("../../../node_modules/.pnpm/@clerk+expo@*/node_modules/@clerk/expo/ios")
clerk_expo_pod = clerk_expo_candidates.find { |path| File.realpath(path) == installed_clerk_expo }
raise "Could not find the installed @clerk/expo iOS pod" unless clerk_expo_pod

pod "ClerkExpo", :path => clerk_expo_pod
