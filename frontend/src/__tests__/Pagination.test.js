import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Pagination from '../components/common/Pagination';

describe('Shared Pagination component', () => {
  test('renders entry counters and navigation buttons correctly', () => {
    const handlePageChange = jest.fn();
    const handlePageSizeChange = jest.fn();

    render(
      <Pagination
        page={2}
        pageSize={10}
        totalCount={83}
        totalPages={9}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    );

    // Showing 11 to 20 of 83
    expect(screen.getByText(/Showing/i)).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('83')).toBeInTheDocument();

    // Check buttons
    const prevBtn = screen.getByRole('button', { name: /previous page/i });
    const nextBtn = screen.getByRole('button', { name: /next page/i });
    const firstBtn = screen.getByRole('button', { name: /first page/i });
    const lastBtn = screen.getByRole('button', { name: /last page/i });

    expect(prevBtn).not.toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    fireEvent.click(prevBtn);
    expect(handlePageChange).toHaveBeenCalledWith(1);

    fireEvent.click(nextBtn);
    expect(handlePageChange).toHaveBeenCalledWith(3);

    fireEvent.click(firstBtn);
    expect(handlePageChange).toHaveBeenCalledWith(1);

    fireEvent.click(lastBtn);
    expect(handlePageChange).toHaveBeenCalledWith(9);
  });

  test('calls onPageSizeChange when selector changes', () => {
    const handlePageSizeChange = jest.fn();
    render(
      <Pagination
        page={1}
        pageSize={10}
        totalCount={50}
        totalPages={5}
        onPageChange={jest.fn()}
        onPageSizeChange={handlePageSizeChange}
      />
    );

    const select = screen.getByLabelText(/rows per page/i);
    fireEvent.change(select, { target: { value: '25' } });
    expect(handlePageSizeChange).toHaveBeenCalledWith(25);
  });

  test('disables first and prev on page 1', () => {
    render(
      <Pagination
        page={1}
        pageSize={10}
        totalCount={50}
        totalPages={5}
        onPageChange={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /first page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next page/i })).not.toBeDisabled();
  });
});

