exports.parseQueryParams = (query) => {
  const { page = 1, limit = 10, sort, ...filters } = query;
  
  return {
    page: parseInt(page),
    limit: parseInt(limit),
    sort,
    filters
  };
};

exports.formatResponse = (data, pagination = null) => {
  return {
    success: true,
    count: Array.isArray(data) ? data.length : 1,
    pagination,
    data
  };
};