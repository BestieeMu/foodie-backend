const supabase = require('../utils/supabase');

const submitReview = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    // 1. Get the order and verify ownership + delivery status
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.user_id !== userId) {
      return res.status(403).json({ message: 'You can only review your own orders' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ message: 'You can only review delivered orders' });
    }

    // 2. Check if review already exists for this order
    const { data: existingReview } = await supabase
      .from('reviews')
      .select('id')
      .eq('order_id', orderId)
      .single();

    if (existingReview) {
      return res.status(409).json({ message: 'You have already reviewed this order' });
    }

    // 3. Create the review
    const reviewId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .insert({
        id: reviewId,
        restaurant_id: order.restaurant_id,
        user_id: userId,
        order_id: orderId,
        rating: parseInt(rating),
        comment: comment || null
      })
      .select()
      .single();

    if (reviewError) throw reviewError;

    // 4. Update the restaurant's average rating
    const { data: allReviews, error: avgError } = await supabase
      .from('reviews')
      .select('rating')
      .eq('restaurant_id', order.restaurant_id);

    if (!avgError && allReviews && allReviews.length > 0) {
      const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
      await supabase
        .from('restaurants')
        .update({ rating: parseFloat(avgRating.toFixed(1)) })
        .eq('id', order.restaurant_id);
    }

    res.status(201).json(review);
  } catch (error) {
    console.error('Submit review error:', error);
    next(error);
  }
};

const getRestaurantReviews = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;

    const { data: reviews, error } = await supabase
      .from('reviews')
      .select('*, user:user_id(name)')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(reviews || []);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitReview,
  getRestaurantReviews,
};
