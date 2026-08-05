package com.gruppoautoscala.followup.repository;

import com.gruppoautoscala.followup.model.UserPermission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserPermissionRepository extends JpaRepository<UserPermission, Long> {
    List<UserPermission> findAll();
    List<UserPermission> findByUserId(Long userId);
    Optional<UserPermission> findByUserIdAndSection(Long userId, String section);
}