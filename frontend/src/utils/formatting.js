export const formatDate = (dateString, options = {}) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const { format = 'short' } = options;

  if (format === 'relative') {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const today = new Date();
    today.setHours(0,0,0,0);
    const target = new Date(date);
    target.setHours(0,0,0,0);
    
    const daysDifference = Math.round((target - today) / (1000 * 60 * 60 * 24));
    
    if (daysDifference === 0) {
       return 'Today';
    } else if (daysDifference === 1) {
       return 'Tomorrow';
    } else if (daysDifference === -1) {
       return 'Yesterday';
    } else if (Math.abs(daysDifference) < 7) {
       return rtf.format(daysDifference, 'day');
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  if (format === 'time') {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  
  if (format === 'datetime') {
    return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString();
};

export const formatSize = (bytes) => {
  const num = Number(bytes);
  if (bytes === undefined || bytes === null || isNaN(num) || num <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(num) / Math.log(k));
  if (i < 0 || i >= sizes.length) return '0 B';
  return parseFloat((num / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};
