import { useState, useEffect } from 'react';

/**
 * Custom hook that listens to a CSS media query and returns whether it matches.
 * SSR safe - returns false when window is undefined.
 *
 * @param query - CSS media query string (e.g., '(min-width: 768px)')
 * @returns boolean indicating if the media query matches
 */
export function useMediaQuery(query: string): boolean {
  // SSR safety: return false when window is undefined
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    // SSR safety check
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQueryList = window.matchMedia(query);

    // Update state to current value
    setMatches(mediaQueryList.matches);

    // Event handler for media query changes
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Add event listener (using addEventListener for modern browsers)
    mediaQueryList.addEventListener('change', handleChange);

    // Cleanup: remove event listener on unmount
    return () => {
      mediaQueryList.removeEventListener('change', handleChange);
    };
  }, [query]);

  return matches;
}

/** Returns true when viewport width is less than 768px */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

/** Returns true when viewport width is between 768px and 1023px */
export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
}
