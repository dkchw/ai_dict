import React, { useState } from 'react';
import { Star } from 'lucide-react';

export default function StarRating({
  value = 0,
  onChange = null,
  size = 'md',
  readOnly = false,
  className = '',
  showClear = false
}) {
  const [hoverValue, setHoverValue] = useState(0);

  const starSizes = {
    xs: 12,
    sm: 14,
    md: 18,
    lg: 22,
    xl: 26
  };
  const pxSize = starSizes[size] || 18;

  const currentVal = hoverValue > 0 ? hoverValue : (value || 0);

  const handleClick = (e, starIndex) => {
    e.stopPropagation();
    if (readOnly || !onChange) return;
    // If clicking already selected rating, reset to 0
    if (value === starIndex) {
      onChange(0);
    } else {
      onChange(starIndex);
    }
  };

  return (
    <div 
      className={`inline-flex items-center gap-0.5 select-none ${className}`}
      onMouseLeave={() => !readOnly && setHoverValue(0)}
      title={readOnly ? `${value || 0} stars` : `Rating: ${value || 0} / 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((starIndex) => {
        const isFilled = starIndex <= currentVal;
        return (
          <button
            key={starIndex}
            type="button"
            disabled={readOnly || !onChange}
            onClick={(e) => handleClick(e, starIndex)}
            onMouseEnter={() => !readOnly && onChange && setHoverValue(starIndex)}
            className={`transition-all duration-150 p-0.5 rounded focus:outline-none ${
              readOnly || !onChange 
                ? 'cursor-default' 
                : 'cursor-pointer hover:scale-120 active:scale-95'
            }`}
            aria-label={`${starIndex} star${starIndex > 1 ? 's' : ''}`}
          >
            <Star
              size={pxSize}
              className={`transition-colors ${
                isFilled
                  ? 'fill-amber-400 text-amber-400 dark:fill-amber-400 dark:text-amber-400 filter drop-shadow-[0_1px_2px_rgba(245,158,11,0.3)]'
                  : 'fill-transparent text-gray-300 dark:text-gray-600 hover:text-amber-300 dark:hover:text-amber-400'
              }`}
            />
          </button>
        );
      })}

      {showClear && value > 0 && !readOnly && onChange && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange(0);
          }}
          className="ml-1 text-[11px] text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
          title="Clear rating"
        >
          &times;
        </button>
      )}
    </div>
  );
}
